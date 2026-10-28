import { writeFile } from 'node:fs/promises';
import { deerRig } from '../../transition/images/companion-art.js';
import { legPose } from '../../transition/images/companions.js';
await writeFile(new URL('./rig.json', import.meta.url), JSON.stringify({
  legs: deerRig.map(leg => ({ ...leg, neutral: legPose(leg, 0, 0) }))
}, null, 2));
