export async function readSecretInput(label) {
  let input = '';
  if (!process.stdin.isTTY) {
    for await (const chunk of process.stdin) input += chunk;
    return JSON.parse(input);
  }
  console.log(`Ready for ${label} JSON on stdin (input is hidden).`);
  process.stdin.setRawMode(true);
  const value = await new Promise((resolve, reject) => {
    const cleanup = () => { process.stdin.off('data', collect); process.stdin.off('end', end); process.stdin.setRawMode(false); process.stdin.pause(); };
    const collect = chunk => {
      input += chunk.toString('utf8');
      if (input.includes('\u0003') || input.length > 65536) { cleanup(); reject(new Error('Input cancelled or too large')); return; }
      if (input.includes('\n') || input.includes('\r')) { cleanup(); resolve(input.trim()); }
    };
    const end = () => { cleanup(); resolve(input.trim()); };
    process.stdin.on('data', collect); process.stdin.once('end', end); process.stdin.resume();
  });
  return JSON.parse(value);
}
