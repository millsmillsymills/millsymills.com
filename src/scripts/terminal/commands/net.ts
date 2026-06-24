import { register } from '../registry';
import { HOSTS, SUBNET, SELF_IP, findHost } from '../network';

register(
	{
		name: 'ifconfig',
		summary: 'show local network interface',
		handler: ({ out }) => {
			out('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
			out(`        inet ${SELF_IP}  netmask 255.255.255.0  broadcast 192.168.1.255`);
			out('        ether de:ad:be:ef:ca:fe  txqueuelen 1000  (Ethernet)');
		},
	},
	{
		name: 'ping',
		summary: 'send ICMP echo to a host',
		usage: 'ping <host>',
		handler: async ({ args, out, sleep }) => {
			const target = args[0];
			if (!target) return out('usage: ping <host>', 't-err');
			const host = findHost(target);
			if (!host) return out(`ping: cannot resolve ${target}: name or service not known`, 't-err');
			out(`PING ${host.name} (${host.ip}) 56(84) bytes of data.`);
			for (let i = 0; i < 4; i += 1) {
				await sleep(180);
				const t = (Math.random() * 6 + 0.4).toFixed(2);
				out(`64 bytes from ${host.name} (${host.ip}): icmp_seq=${i + 1} ttl=64 time=${t} ms`);
			}
			out('');
			out(`--- ${host.name} ping statistics ---`);
			out('4 packets transmitted, 4 received, 0% packet loss');
		},
	},
	{
		name: 'nmap',
		summary: 'scan local network or a single host',
		usage: 'nmap [<host> | <subnet>]',
		handler: async ({ args, out, sleep }) => {
			const target = args[0] ?? SUBNET;

			out(`Starting Nmap 7.94 ( https://nmap.org ) at ${new Date().toISOString()}`);
			await sleep(220);

			if (target === SUBNET || target === '192.168.1.0/24' || target === '192.168.1.*') {
				for (const h of HOSTS) {
					await sleep(150);
					out(`Nmap scan report for ${h.name} (${h.ip})`);
					out(`Host is up (0.00${Math.floor(Math.random() * 90) + 10}s latency).`);
				}
				out('');
				out(`Nmap done: ${HOSTS.length} IP addresses (${HOSTS.length} hosts up) scanned.`);
				out('');
				out("hint: try `nmap <ip>` on something interesting.", 't-dim');
				return;
			}

			const host = findHost(target);
			if (!host) {
				out(`Failed to resolve "${target}".`, 't-err');
				return;
			}

			out(`Nmap scan report for ${host.name} (${host.ip})`);
			out(`Host is up (0.00${Math.floor(Math.random() * 90) + 10}s latency).`);
			out('');
			out('PORT      STATE SERVICE      VERSION');
			for (const p of host.ports) {
				await sleep(120);
				out(
					`${(p.port + '/tcp').padEnd(10)}open  ${p.service.padEnd(13)}${p.banner}`,
					'',
				);
			}
			out('');
			out(`Service Info: OS: ${host.os}`);
			out('');
			out('Nmap done: 1 IP address (1 host up) scanned.');
		},
	},
	{
		name: 'curl',
		summary: 'fetch a URL',
		usage: 'curl <url>',
		handler: async ({ args, out, sleep }) => {
			const url = args[args.length - 1];
			if (!url) return out('usage: curl <url>', 't-err');
			const m = url.match(/^https?:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/);
			if (!m) return out(`curl: (3) URL rejected: ${url}`, 't-err');
			const hostStr = m[1] ?? '';
			const port = m[2] ? Number(m[2]) : 80;
			const host = findHost(hostStr);
			if (!host) return out(`curl: (6) Could not resolve host: ${hostStr}`, 't-err');
			const p = host.ports.find((x) => x.port === port);
			if (!p) return out(`curl: (7) Failed to connect to ${hostStr} port ${port}: Connection refused`, 't-err');
			await sleep(180);
			if (p.httpBody) {
				p.httpBody.split('\n').forEach((line) => out(line));
			} else {
				out(`<html><body><h1>${p.banner}</h1><p>nothing to see here.</p></body></html>`);
			}
		},
	},
	{
		name: 'ssh',
		summary: 'connect to a host (read-only)',
		usage: 'ssh <user>@<host>',
		handler: async ({ args, out, sleep }) => {
			const target = args[0];
			if (!target) return out('usage: ssh <user>@<host>', 't-err');
			const m = target.match(/^([^@]+)@(.+)$/);
			const user = m ? (m[1] ?? 'mills') : 'mills';
			const hostStr = m ? (m[2] ?? target) : target;
			const host = findHost(hostStr);
			if (!host) return out(`ssh: Could not resolve hostname ${hostStr}: ...`, 't-err');
			const sshPort = host.ports.find((p) => p.service === 'ssh');
			if (!sshPort) return out(`ssh: connect to host ${hostStr} port 22: Connection refused`, 't-err');
			await sleep(220);
			out(`The authenticity of host '${host.name} (${host.ip})' can't be established.`);
			out(`ED25519 key fingerprint is SHA256:${randHash()}.`);
			await sleep(180);
			out(`${user}@${hostStr}: Permission denied (publickey).`, 't-err');
			out('');
			out("hint: this is a static site. real ssh is left as an exercise.", 't-dim');
		},
	},
);

function randHash(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/';
	let s = '';
	for (let i = 0; i < 43; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
	return s;
}
