/*
 * Fake LAN for the terminal's nmap/curl/ssh/ping commands.
 *
 * Each Host has a friendly name + an OS string + a list of open Ports.
 * Some ports advertise a "vulnerable" banner.
 */

export interface Port {
	readonly port: number;
	readonly service: string;
	readonly banner: string;
	readonly httpBody?: string;
}

export interface Host {
	readonly ip: string;
	readonly name: string;
	readonly os: string;
	readonly ports: readonly Port[];
}

const labBody = `<!doctype html>
<html><head><title>lab.local</title></head>
<body style="font-family:monospace;background:#111;color:#0f0">
<h1>welcome to lab.local</h1>
<p>this is mills's pet pwn-lab. there's nothing here.</p>
</body></html>`;

export const HOSTS: readonly Host[] = [
	{
		ip: '192.168.1.1',
		name: 'gateway.local',
		os: 'OpenWrt 23.05',
		ports: [
			{ port: 22, service: 'ssh', banner: 'SSH-2.0-Dropbear_2022.83' },
			{ port: 53, service: 'domain', banner: 'dnsmasq 2.89' },
			{ port: 80, service: 'http', banner: 'LuCI-OpenWrt' },
		],
	},
	{
		ip: '192.168.1.10',
		name: 'mills-laptop.local',
		os: 'macOS 14.6',
		ports: [{ port: 22, service: 'ssh', banner: 'SSH-2.0-OpenSSH_9.7' }],
	},
	{
		ip: '192.168.1.42',
		name: 'lab.local',
		os: 'Debian 12 (bookworm)',
		ports: [
			{ port: 22, service: 'ssh', banner: 'SSH-2.0-OpenSSH_9.2p1 Debian-2+deb12u3' },
			{ port: 80, service: 'http', banner: 'nginx/1.22.1', httpBody: labBody },
			{ port: 8080, service: 'http-alt', banner: 'Werkzeug/3.0.3 Python/3.11.9' },
		],
	},
	{
		ip: '192.168.1.100',
		name: 'pihole.local',
		os: 'Raspberry Pi OS Lite (12)',
		ports: [
			{ port: 53, service: 'domain', banner: 'pihole-FTL/5.25.2' },
			{ port: 80, service: 'http', banner: 'lighttpd/1.4.69' },
		],
	},
	{
		ip: '192.168.1.250',
		name: 'nas.local',
		os: 'TrueNAS SCALE 24.04',
		ports: [
			{ port: 22, service: 'ssh', banner: 'SSH-2.0-OpenSSH_9.2p1' },
			{ port: 111, service: 'rpcbind', banner: '4 (RPC #100000)' },
			{ port: 445, service: 'smb', banner: 'Samba 4.18.5' },
			{ port: 2049, service: 'nfs', banner: '4.2 (RPC #100003)' },
		],
	},
];

export const SUBNET = '192.168.1.0/24';
export const SELF_IP = '192.168.1.10'; // mills-laptop

export function findHost(target: string): Host | undefined {
	const t = target.toLowerCase();
	return HOSTS.find((h) => h.ip === t || h.name === t || h.name.split('.')[0] === t);
}
