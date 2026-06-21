import assert from "node:assert/strict";
import test from "node:test";
import { BufferQueue } from "../src/utils/bufferQueue.js";

void test("BufferQueue reads fragmented data without repeated whole-buffer concatenation", () => { const queue = new BufferQueue(); queue.push(Buffer.from("ab")); queue.push(Buffer.from("cdef")); assert.equal(queue.read(3).toString(), "abc"); assert.equal(queue.length, 3); assert.equal(queue.read(3).toString(), "def"); });
