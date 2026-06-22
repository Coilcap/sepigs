import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscription } from "../src/subscription/parser.js";
import { redactSubscriptionOutbounds } from "../src/subscription/redact.js";

void test("subscription dry-run redaction removes passwords and peer keys", () => { const input = `trojan://top-secret@example.test:443#node\nwireguard://private-key:public-key@wg.test:51820?address=10.0.0.2/32#wg`; const rendered = JSON.stringify(redactSubscriptionOutbounds(parseSubscription(input).outbounds)); assert.doesNotMatch(rendered, /top-secret|private-key|public-key/u); assert.match(rendered, /REDACTED/u); });
