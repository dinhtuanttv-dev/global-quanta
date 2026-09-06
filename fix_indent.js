const fs = require('fs');
const p = 'c:/Users/HP/global-quanta-react_1/global-quanta/src/hooks/useGlobalStream.ts';
let lines = fs.readFileSync(p, 'utf8').split('\n');
// Fix line 39 (0-indexed 38): set to 2-space indent
lines[38] = '  const [data, setData] = useState<StreamPayload | null>(null);';
// Fix line 52 (0-indexed 51): set to 4-space indent
lines[51] = '    const es = new EventSource(`${API_BASE}/api/global/stream`);';
// Fix line 67 (0-indexed 66): set to 4-space indent
lines[66] = '    es.onerror = () => {';
fs.writeFileSync(p, lines.join('\n'));
console.log('Fixed indentation on lines 39, 52, 67');
console.log('Line 39:', JSON.stringify(lines[38]));
console.log('Line 52:', JSON.stringify(lines[51]));
console.log('Line 67:', JSON.stringify(lines[66]));
