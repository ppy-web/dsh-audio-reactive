import { appendFileSync, readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
  throw new Error(`Invalid release version: ${version}`)
}
if (process.env.RELEASE_TAG !== `v${version}`) {
  throw new Error(`Tag must match package version v${version}`)
}
const npmTag = version.includes('-') ? 'next' : 'latest'
appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nnpm_tag=${npmTag}\n`)
console.log(`dsh-audio-reactive@${version} -> ${npmTag}`)
