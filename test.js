import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const proc = spawn('node', [join(__dirname, 'index.js')]);

let output = '';
proc.stdout.on('data', (data) => {
  output += data.toString();
});
proc.stderr.on('data', () => {});

// Initialize
const init = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0' },
  },
};
proc.stdin.write(JSON.stringify(init) + '\n');

// Test execute_sql
setTimeout(() => {
  const call = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'execute_sql',
      arguments: {
        query: 'SELECT current_database(), current_user',
      },
    },
  };
  proc.stdin.write(JSON.stringify(call) + '\n');
}, 500);

setTimeout(() => {
  proc.kill();
  const lines = output.trim().split('\n');
  const resultLine = lines.find((l) => l.includes('"id":3'));
  if (resultLine) {
    const parsed = JSON.parse(resultLine);
    console.log('✅ MCP Server funcionando!');
    console.log(JSON.stringify(parsed.result, null, 2));
  } else {
    console.log('Resposta completa:');
    console.log(output);
  }
}, 1500);
