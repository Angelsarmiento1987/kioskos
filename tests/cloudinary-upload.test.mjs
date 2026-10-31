import test from "node:test";
import assert from "node:assert/strict";
import { uploadToCloudinary } from "../src/cloudinary-upload.js";
const blob = new Blob(["webp-fixture"], { type: "image/webp" });
const config = {
  blob,
  name: "hamburguesa.jpg",
  kioskId: "kiosk-1",
  cloudName: "test-cloud",
  preset: "unsigned-products",
};
function operations() {
  const actions = [];
  return {
    actions,
    call: async (name, data) => {
      actions.push({ name, data });
      if (name === "reserveImage")
        return { imageId: "image-1", publicId: "kiosks/kiosk-1/image-1" };
      if (name === "deleteImage")
        return data.rejectedUpload
          ? { deleted: true }
          : { pendingDeletion: true };
      return { id: "image-1" };
    },
  };
}
test("unsigned upload sends supported fields only and finalizes returned delete token", async () => {
  const ops = operations();
  const asset = {
    public_id: "kiosks/kiosk-1/image-1",
    secure_url:
      "https://res.cloudinary.com/test-cloud/image/upload/sample.webp",
    format: "webp",
    bytes: 12,
    delete_token: "temporary-fixture",
  };
  const result = await uploadToCloudinary({
    ...config,
    ...ops,
    fetcher: async (url, request) => {
      assert.equal(
        url,
        "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
      );
      assert.deepEqual([...request.body.keys()].sort(), [
        "file",
        "public_id",
        "upload_preset",
      ]);
      assert.equal(request.body.get("return_delete_token"), null);
      assert.equal(request.body.get("upload_preset"), config.preset);
      return { ok: true, status: 200, json: async () => asset };
    },
  });
  assert.equal(result.id, "image-1");
  assert.equal(ops.actions[1].name, "finalizeImage");
  assert.equal(ops.actions[1].data.asset.delete_token, "temporary-fixture");
  assert.equal(ops.actions.length, 2);
});
test("explicit 400 rejection releases a failed reservation and preserves the provider message", async () => {
  const ops = operations();
  await assert.rejects(
    uploadToCloudinary({
      ...config,
      ...ops,
      fetcher: async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Parameter not allowed" } }),
      }),
    }),
    /Parameter not allowed/,
  );
  assert.deepEqual(
    ops.actions.map((x) => x.name),
    ["reserveImage", "deleteImage"],
  );
  assert.equal(ops.actions[1].data.rejectedUpload, true);
});
test("network failure does not claim that the provider has no file", async () => {
  const ops = operations();
  await assert.rejects(
    uploadToCloudinary({
      ...config,
      ...ops,
      fetcher: async () => {
        throw new Error("Network failed");
      },
    }),
    /reserva sigue ocupando cupo/,
  );
  assert.equal(ops.actions[1].data.rejectedUpload, false);
});
test("server failure and ID conflict keep the provider result uncertain", async () => {
  for (const status of [409, 500]) {
    const ops = operations();
    await assert.rejects(
      uploadToCloudinary({
        ...config,
        ...ops,
        fetcher: async () => ({
          ok: false,
          status,
          json: async () => ({ error: { message: "Provider failed" } }),
        }),
      }),
    );
    assert.equal(ops.actions[1].data.rejectedUpload, false);
  }
});
test("a successful upload followed by Firestore failure is kept for review", async () => {
  const ops = operations();
  const call = async (name, data) => {
    if (name === "finalizeImage") throw new Error("Firestore unavailable");
    return ops.call(name, data);
  };
  await assert.rejects(
    uploadToCloudinary({
      ...config,
      call,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ format: "webp", bytes: 12 }),
      }),
    }),
    /Revisá Cloudinary/,
  );
  assert.equal(
    ops.actions.some((x) => x.name === "deleteImage"),
    false,
  );
});
