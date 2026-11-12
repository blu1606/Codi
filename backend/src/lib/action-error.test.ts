// How the action bridge answers a domain refusal: its own 4xx status and message, never the 500 server-failure reply.
import { describe, expect, it } from "vitest";
import { ActionRefusedError, refusalResponse } from "./action-error";

describe("refusalResponse", () => {
  it("answers a refusal with 409 and the message by default", async () => {
    const res = refusalResponse(new ActionRefusedError("Không thể xoá bài học vì còn câu hỏi quiz gắn với bài này."));
    expect(res?.status).toBe(409);
    expect(await res?.json()).toEqual({ error: "Không thể xoá bài học vì còn câu hỏi quiz gắn với bài này." });
  });

  it("keeps the status the action chose", () => {
    expect(refusalResponse(new ActionRefusedError("Không tìm thấy bài học trong khoá học này.", 404))?.status).toBe(404);
  });

  it("leaves plain errors and non-errors to the server-failure path", () => {
    expect(refusalResponse(new Error("boom"))).toBeNull();
    expect(refusalResponse("boom")).toBeNull();
    expect(refusalResponse(undefined)).toBeNull();
  });

  it("is still an Error, so existing catch blocks keep working", () => {
    const error = new ActionRefusedError("x");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ActionRefusedError");
  });
});
