import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the CatchCatch result screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>캐치캐치 \| 상품 가격 분석<\/title>/i);
  assert.match(html, /라운드랩 독도 선크림/);
  assert.match(html, /저점매수/);
  assert.match(html, /판단 신뢰도/);
  assert.match(html, /유사상품 보기/);
  assert.match(html, /판매처 비교/);
  assert.match(html, /http:\/\/localhost:3000\/home/);
  assert.match(html, /15,000원/);
  assert.doesNotMatch(html, /임시 목업|화면 검증용|연결 대기/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});
