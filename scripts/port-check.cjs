// 端口探测：已监听返回 exit 1（busy），未监听返回 exit 0（free）
const net = require('net')
const port = Number(process.argv[2])
if (!port) process.exit(0)
const sock = net.connect(port, '127.0.0.1')
sock.setTimeout(800)
sock.on('connect', () => { sock.destroy(); process.exit(1) })
sock.on('error', () => process.exit(0))
sock.on('timeout', () => { sock.destroy(); process.exit(0) })
