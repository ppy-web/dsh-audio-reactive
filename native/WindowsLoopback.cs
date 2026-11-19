using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace DshAudioReactive
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class DeviceEnumerator {}

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int flow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsctx, IntPtr properties, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint flags, long duration, long period, IntPtr format, IntPtr session);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint frames);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr handle);
        [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong clockPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    public static class Loopback
    {
        private static void Check(int result) { if (result < 0) Marshal.ThrowExceptionForHR(result); }

        private static int ReadSample(byte[] data, int offset, int bits, bool floating)
        {
            if (floating)
            {
                float value = BitConverter.ToSingle(data, offset);
                return float.IsNaN(value) ? 0 : (int)Math.Max(-32768, Math.Min(32767, value * 32768));
            }
            if (bits == 16) return BitConverter.ToInt16(data, offset);
            if (bits == 24) return (short)(data[offset + 1] | (data[offset + 2] << 8));
            return BitConverter.ToInt32(data, offset) >> 16;
        }

        public static void Stream()
        {
            IDeviceEnumerator enumerator = null;
            IDevice device = null;
            IAudioClient client = null;
            IAudioCaptureClient capture = null;
            IntPtr format = IntPtr.Zero;
            try
            {
                enumerator = (IDeviceEnumerator)(object)new DeviceEnumerator();
                // eRender, eMultimedia: monitor the default output device.
                Check(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
                object instance;
                Guid iid = typeof(IAudioClient).GUID;
                Check(device.Activate(ref iid, 23, IntPtr.Zero, out instance));
                client = (IAudioClient)instance;
                Check(client.GetMixFormat(out format));
                int tag = (ushort)Marshal.ReadInt16(format, 0);
                int channels = Marshal.ReadInt16(format, 2);
                int rate = Marshal.ReadInt32(format, 4);
                int alignment = Marshal.ReadInt16(format, 12);
                int bits = Marshal.ReadInt16(format, 14);
                if (tag == 65534 && Marshal.ReadInt16(format, 16) >= 22)
                {
                    Guid subtype = (Guid)Marshal.PtrToStructure(IntPtr.Add(format, 24), typeof(Guid));
                    tag = subtype == new Guid("00000003-0000-0010-8000-00aa00389b71") ? 3
                        : subtype == new Guid("00000001-0000-0010-8000-00aa00389b71") ? 1 : 0;
                }
                if (channels < 1 || rate < 8000 || rate > 192000 || alignment < channels * (bits / 8) ||
                    !(tag == 3 && bits == 32 || tag == 1 && (bits == 16 || bits == 24 || bits == 32)))
                    throw new NotSupportedException("Unsupported output mix format");

                // Shared WASAPI loopback, polled so it works without an event-handle helper.
                Check(client.Initialize(0, 0x00020000, 2000000, 0, format, IntPtr.Zero));
                iid = typeof(IAudioCaptureClient).GUID;
                Check(client.GetService(ref iid, out instance));
                capture = (IAudioCaptureClient)instance;
                Check(client.Start());
                using (var output = new BinaryWriter(Console.OpenStandardOutput()))
                {
                    output.Write(rate);
                    output.Flush();
                    byte[] buffer = new byte[0];
                    byte[] stereo = new byte[0];
                    while (true)
                    {
                        uint waiting;
                        Check(capture.GetNextPacketSize(out waiting));
                        if (waiting == 0) { Thread.Sleep(10); continue; }
                        IntPtr data;
                        uint frames, flags;
                        ulong position, time;
                        Check(capture.GetBuffer(out data, out frames, out flags, out position, out time));
                        if (frames == 0) continue;
                        try
                        {
                            int size = checked((int)frames * alignment);
                            int outputSize = checked((int)frames * 4);
                            if (stereo.Length < outputSize) stereo = new byte[outputSize];
                            if ((flags & 2) != 0) Array.Clear(stereo, 0, outputSize);
                            else
                            {
                                if (buffer.Length < size) buffer = new byte[size];
                                Marshal.Copy(data, buffer, 0, size);
                                for (int i = 0; i < frames; i++)
                                {
                                    int offset = i * alignment;
                                    int left = ReadSample(buffer, offset, bits, tag == 3);
                                    int right = channels == 1 ? left : ReadSample(buffer, offset + bits / 8, bits, tag == 3);
                                    stereo[i * 4] = (byte)left;
                                    stereo[i * 4 + 1] = (byte)(left >> 8);
                                    stereo[i * 4 + 2] = (byte)right;
                                    stereo[i * 4 + 3] = (byte)(right >> 8);
                                }
                            }
                            output.Write(stereo, 0, outputSize);
                            output.Flush();
                        }
                        finally { Check(capture.ReleaseBuffer(frames)); }
                    }
                }
            }
            finally
            {
                if (client != null) client.Stop();
                if (format != IntPtr.Zero) Marshal.FreeCoTaskMem(format);
                if (capture != null) Marshal.ReleaseComObject(capture);
                if (client != null) Marshal.ReleaseComObject(client);
                if (device != null) Marshal.ReleaseComObject(device);
                if (enumerator != null) Marshal.ReleaseComObject(enumerator);
            }
        }
    }
}
