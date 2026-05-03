// Node 25's experimental built-in webstorage interferes with happy-dom's
// `window.localStorage` (the native binding shadows happy-dom's, and the
// native one only works when `--localstorage-file=<path>` is passed). Tests
// that exercise localStorage end up calling stubs without setItem/getItem.
//
// Install a minimal in-memory Storage shim on globalThis so test code that
// reads/writes `localStorage` works the same way as in the browser.
class MemoryStorage implements Storage {
	private store = new Map<string, string>();

	get length(): number {
		return this.store.size;
	}

	clear(): void {
		this.store.clear();
	}

	getItem(key: string): string | null {
		return this.store.has(key) ? this.store.get(key)! : null;
	}

	key(index: number): string | null {
		return [...this.store.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.store.delete(key);
	}

	setItem(key: string, value: string): void {
		this.store.set(key, String(value));
	}
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
	value: storage,
	configurable: true,
	writable: true,
});

if (typeof window !== 'undefined') {
	Object.defineProperty(window, 'localStorage', {
		value: storage,
		configurable: true,
		writable: true,
	});
}
