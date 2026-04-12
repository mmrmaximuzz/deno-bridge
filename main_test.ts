import { assertEquals } from "@std/assert";
import { add } from "./main.ts";

Deno.test("try throw", () => {
    assertEquals(add(2, 1), 3);
});
