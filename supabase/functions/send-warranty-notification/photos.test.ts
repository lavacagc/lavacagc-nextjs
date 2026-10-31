// deno test --allow-net --allow-env supabase/functions/send-warranty-notification/photos.test.ts
//
// The storage half needs a NON-production project (staging):
//   WARRANTY_TEST_SUPABASE_URL, WARRANTY_TEST_ANON_KEY, WARRANTY_TEST_SERVICE_KEY
// Without them only the pure tests run. It uploads one object the way the public
// form does (anon key) and deletes it afterwards.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PHOTO_PATH, escapeHtml, signWarrantyPhotos } from "./photos.ts";

Deno.test("escapeHtml neutralises markup and quotes", () => {
  assertEquals(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assertEquals(escapeHtml(undefined), "");
});

Deno.test("PHOTO_PATH accepts the form's names and nothing with a folder", () => {
  assertMatch("1761950000000-0-kitchen leak.jpg", PHOTO_PATH);
  assert(!PHOTO_PATH.test("other-bucket/1-0-x.jpg"));
  assert(!PHOTO_PATH.test("../1-0-x.jpg"));
  assert(!PHOTO_PATH.test("https://evil.example/x.jpg"));
});

const url = Deno.env.get("WARRANTY_TEST_SUPABASE_URL");
const anonKey = Deno.env.get("WARRANTY_TEST_ANON_KEY");
const serviceKey = Deno.env.get("WARRANTY_TEST_SERVICE_KEY");

Deno.test({
  name: "a photo uploaded anonymously is private, and the function's signed link opens it",
  ignore: !url || !anonKey || !serviceKey,
  async fn() {
    if (url!.includes("xrvbrnrbnyfdwkfdoepq")) throw new Error("refusing to run against production");
    const anon = createClient(url!, anonKey!);
    const service = createClient(url!, serviceKey!);
    const path = `${Date.now()}-0-test photo.txt`;
    const up = await anon.storage.from("warranty-images").upload(path, new Blob(["warranty-test"]), { contentType: "text/plain" });
    assertEquals(up.error, null, "the public form's anonymous upload must keep working");
    try {
      const anonRead = await anon.storage.from("warranty-images").download(path);
      assert(anonRead.error, "an anonymous caller must not read a warranty photo");

      const { urls, unsigned } = await signWarrantyPhotos(service, [path, "1-0-does-not-exist.jpg"]);
      assertEquals(urls.length, 1);
      assertEquals(unsigned, ["1-0-does-not-exist.jpg"]);
      const res = await fetch(urls[0]);
      assertEquals(res.status, 200);
      assertEquals(await res.text(), "warranty-test");
    } finally {
      await service.storage.from("warranty-images").remove([path]);
    }
  },
});
