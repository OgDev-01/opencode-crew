import * as fs from "node:fs"
import * as path from "node:path"

const root = process.cwd()
const entries = fs.readdirSync(root)
const dumpFiles = entries.filter((entry) => /^\.[^.].*\.bun-build$/.test(entry))

for (const file of dumpFiles) {
  fs.rmSync(path.join(root, file), { force: true })
}

console.log(`Removed ${dumpFiles.length} Bun dump file(s).`)
