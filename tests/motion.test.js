const test = require("node:test");
const assert = require("node:assert/strict");
const { createMotionController, capturePositions } = require("../renderer/motion.js");

test("capturePositions stores stable task ids", () => {
  const nodes = [{ dataset: { id: "a" }, getBoundingClientRect: () => ({ left: 10, top: 20 }) }];
  assert.deepEqual(capturePositions(nodes).get("a"), { left: 10, top: 20 });
});

test("controller is a no-op without GSAP or with reduced motion", () => {
  const panel = { style: {}, dataset: {} };
  createMotionController({ gsap: null, prefersReducedMotion: () => false })
    .animateAssistant(panel, true);
  const calls = [];
  const gsap = { fromTo: (...args) => calls.push(args), to: (...args) => calls.push(args) };
  createMotionController({ gsap, prefersReducedMotion: () => true })
    .animateAssistant(panel, false);
  assert.equal(calls.length, 0);
});

test("assistant motion uses a bounded state transition", () => {
  const calls = [];
  const gsap = { to: (...args) => calls.push(args), fromTo() {} };
  createMotionController({ gsap, prefersReducedMotion: () => false })
    .animateAssistant({}, true);
  assert.equal(calls[0][1].duration <= 0.24, true);
  assert.equal(calls[0][1].ease, "power2.out");
});

test("assistant motion removes its temporary transform at completion", () => {
  const panel = {
    style: {
      transform: "",
      removeProperty(name) {
        if (name === "transform") this.transform = "";
      }
    }
  };
  const gsap = {
    to(node, options) {
      node.style.transform = "translate3d(0px, 0px, 0px)";
      options.onComplete?.();
    },
    fromTo() {}
  };
  createMotionController({ gsap, prefersReducedMotion: () => false })
    .animateAssistant(panel, false);
  assert.equal(panel.style.transform, "");
});

test("reduced motion interrupts a pending assistant tween and clears transient styles", () => {
  let killed = false;
  const panel = {
    style: {
      transform: "translate3d(0px, 0px, 0px)",
      opacity: ".82",
      removeProperty(name) {
        this[name] = "";
      }
    }
  };
  const gsap = {
    killTweensOf(node) {
      killed = node === panel;
    },
    to() {},
    fromTo() {}
  };
  createMotionController({ gsap, prefersReducedMotion: () => true })
    .animateAssistant(panel, true);
  assert.equal(killed, true);
  assert.equal(panel.style.transform, "");
  assert.equal(panel.style.opacity, "");
});
