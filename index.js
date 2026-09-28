/**
 * Host half of dsh-external-link.
 *
 * The browser half captures anchor clicks and POSTs the target here; this half
 * hands the URL to the platform opener so the OS default browser (or mail/tel
 * client) takes it. That is the only path that also covers localhost, which the
 * Electron shell otherwise keeps as an in-app window.
 */
import { spawn } from "node:child_process";

/** Cordis plugin name (the row id is this bundle's patch row id). */
export const name = "external-link";

/** Exact route the browser half posts to. */
const OPEN_PATH = "/external-link/open";
/** Schemes this route is willing to hand to the OS opener. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
/** One URL per request; anything larger than this is not a link. */
const MAX_URL_LENGTH = 8192;
/** Request bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 16 * 1024;

/** JSON response (no-store: an open outcome is a live fact). */
function sendJson(res, status, payload) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(payload));
}

/** Read the whole request body, or null when it exceeds the bound. */
function readBoundedBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				resolve(null);
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

/** Normalize and validate one client-supplied URL. Returns null when rejected. */
function acceptedUrl(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return null;
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		return null;
	}
	if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
	return parsed.href;
}

/** The platform command that opens one URL in the user's default application. */
function openerCommand(url, platform) {
	if (platform === "darwin") return { command: "open", args: [url] };
	if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
	return { command: "xdg-open", args: [url] };
}

/** Hand one URL to the platform opener. Resolves after the child is spawned. */
function openExternal(url) {
	const { command, args } = openerCommand(url, process.platform);
	return new Promise((resolve) => {
		try {
			const child = spawn(command, args, { detached: true, stdio: "ignore" });
			child.on("error", () => resolve(false));
			child.unref();
			resolve(true);
		} catch {
			resolve(false);
		}
	});
}

/**
 * Register the open route on a scope that carries the web transport.
 * @param scope - context whose webServer and connection services are available.
 */
function registerRoute(scope) {
	/** Answer an untrusted/unauthenticated request; true when it was rejected. */
	const rejected = (req, res) => {
		const rejection = scope.connection.requestRejection(req);
		if (rejection === void 0) return false;
		res.statusCode = rejection;
		res.end();
		return true;
	};
	scope.effect(() => scope.webServer.register({
		kind: "exact",
		path: OPEN_PATH,
		handler: async (req, res) => {
			if (rejected(req, res)) return;
			if (req.method !== "POST") {
				res.statusCode = 405;
				res.setHeader("allow", "POST");
				res.end();
				return;
			}
			let text;
			try {
				text = await readBoundedBody(req);
			} catch {
				sendJson(res, 400, { code: "bad-request", message: "request body unreadable" });
				return;
			}
			if (text === null) {
				sendJson(res, 413, { code: "payload-too-large", message: "request body is too large" });
				return;
			}
			let url;
			try {
				url = acceptedUrl(JSON.parse(text)?.url);
			} catch {
				url = null;
			}
			if (url === null) {
				sendJson(res, 400, { code: "bad-request", message: "url must be an http, https, mailto or tel URL" });
				return;
			}
			if (await openExternal(url)) sendJson(res, 200, { ok: true });
			else sendJson(res, 502, { code: "open-failed", message: "the platform opener could not be started" });
		}
	}), "external-link: POST " + OPEN_PATH);
}

/**
 * Activate the route once the web transport exists; a profile without it stays
 * a harmless no-op instead of parking this plugin in PENDING forever.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
	ctx.inject(["webServer", "connection"], (scope) => {
		registerRoute(scope);
	});
}
