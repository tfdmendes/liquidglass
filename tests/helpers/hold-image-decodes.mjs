export function holdImageDecodes() {
  const decode = Image.prototype.decode;
  const releases = [];
  Image.prototype.decode = function () {
    // Register the gate before decoding so completion order cannot change request order
    const gate = new Promise((resolve) => releases.push(resolve));
    return Promise.all([decode.call(this), gate]);
  };
  return {
    releases,
    restore() { Image.prototype.decode = decode; },
  };
}
