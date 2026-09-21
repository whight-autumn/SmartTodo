(function exposeMotionSystem(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MotionSystem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMotionSystem() {
  function capturePositions(nodes) {
    return new Map([...nodes].map(node => {
      const { left, top } = node.getBoundingClientRect();
      return [node.dataset.id, { left, top }];
    }));
  }

  function createMotionController({
    gsap,
    prefersReducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  } = {}) {
    const enabled = () => Boolean(gsap) && !prefersReducedMotion();
    return {
      animateTaskReflow(elements, before) {
        if (!enabled()) return;
        for (const node of elements) {
          const previous = before.get(node.dataset.id);
          if (!previous) continue;
          const current = node.getBoundingClientRect();
          gsap.fromTo(node,
            { x: previous.left - current.left, y: previous.top - current.top, opacity: .72 },
            { x: 0, y: 0, opacity: 1, duration: .22, ease: "power2.out", clearProps: "transform,opacity" });
        }
      },
      animateAssistant(panel, collapsed) {
        if (!gsap || prefersReducedMotion()) {
          gsap?.killTweensOf?.(panel);
          panel?.style?.removeProperty?.("transform");
          panel?.style?.removeProperty?.("opacity");
          return;
        }
        const clearTransform = () => {
          panel?.style?.removeProperty?.("transform");
        };
        gsap.to(panel, {
          opacity: collapsed ? .82 : 1,
          x: 0,
          duration: .22,
          ease: "power2.out",
          clearProps: "transform",
          onComplete: clearTransform,
          onInterrupt: clearTransform
        });
      },
      animateDialog(card) {
        if (enabled()) gsap.fromTo(card,
          { y: 8, opacity: 0 },
          { y: 0, opacity: 1, duration: .18, ease: "power2.out", clearProps: "transform,opacity" });
      },
      animateToast(node) {
        if (enabled()) gsap.fromTo(node,
          { y: -6, opacity: 0 },
          { y: 0, opacity: 1, duration: .16, ease: "power2.out", clearProps: "transform,opacity" });
      }
    };
  }

  return { createMotionController, capturePositions };
});
