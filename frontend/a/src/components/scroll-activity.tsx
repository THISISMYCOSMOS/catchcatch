"use client";

import { useEffect } from "react";

const SCROLLING_CLASS_NAME = "is-scrolling";
const SCROLL_HOVER_CLASS_NAME = "is-scroll-hovered";
const SCROLL_IDLE_DELAY_MS = 700;

function getScrollElement(target: EventTarget | null): HTMLElement | null {
  if (
    target === window
    || target === document
    || target === document.documentElement
    || target === document.body
  ) {
    return document.documentElement;
  }
  return target instanceof HTMLElement ? target : null;
}

function isScrollable(element: HTMLElement): boolean {
  const hasVerticalOverflow = element.scrollHeight > element.clientHeight + 1;
  const hasHorizontalOverflow = element.scrollWidth > element.clientWidth + 1;
  if (element === document.documentElement) return hasVerticalOverflow || hasHorizontalOverflow;

  const style = window.getComputedStyle(element);
  const allowsVerticalScroll = /^(auto|scroll|overlay)$/.test(style.overflowY);
  const allowsHorizontalScroll = /^(auto|scroll|overlay)$/.test(style.overflowX);
  return (allowsVerticalScroll && hasVerticalOverflow) || (allowsHorizontalScroll && hasHorizontalOverflow);
}

function getHoveredScrollElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  let element = target instanceof HTMLElement ? target : target.parentElement;

  while (element && element !== document.body && element !== document.documentElement) {
    if (isScrollable(element)) return element;
    element = element.parentElement;
  }

  return isScrollable(document.documentElement) ? document.documentElement : null;
}

export function ScrollActivity() {
  useEffect(() => {
    const idleTimers = new Map<HTMLElement, number>();
    const queuedElements = new Set<HTMLElement>();
    let animationFrame: number | null = null;
    let hoveredElement: HTMLElement | null = null;

    function markAsScrolling(element: HTMLElement) {
      element.classList.add(SCROLLING_CLASS_NAME);
      const previousTimer = idleTimers.get(element);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      const idleTimer = window.setTimeout(() => {
        element.classList.remove(SCROLLING_CLASS_NAME);
        idleTimers.delete(element);
      }, SCROLL_IDLE_DELAY_MS);
      idleTimers.set(element, idleTimer);
    }

    function flushQueuedElements() {
      animationFrame = null;
      for (const element of queuedElements) markAsScrolling(element);
      queuedElements.clear();
    }

    function queueScrollTarget(target: EventTarget | null) {
      const element = getScrollElement(target);
      if (!element) return;
      queuedElements.add(element);
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(flushQueuedElements);
    }

    function handleDocumentScroll(event: Event) {
      queueScrollTarget(event.target);
    }

    function handleWindowScroll() {
      queueScrollTarget(document.documentElement);
    }

    function updateHoveredElement(target: EventTarget | null) {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const nextElement = getHoveredScrollElement(target);
      if (nextElement === hoveredElement) return;
      hoveredElement?.classList.remove(SCROLL_HOVER_CLASS_NAME);
      hoveredElement = nextElement;
      hoveredElement?.classList.add(SCROLL_HOVER_CLASS_NAME);
    }

    function clearHoveredElement() {
      hoveredElement?.classList.remove(SCROLL_HOVER_CLASS_NAME);
      hoveredElement = null;
    }

    function handlePointerOver(event: PointerEvent) {
      updateHoveredElement(event.target);
    }

    function handlePointerOut(event: PointerEvent) {
      updateHoveredElement(event.relatedTarget);
    }

    document.addEventListener("scroll", handleDocumentScroll, { capture: true, passive: true });
    document.addEventListener("pointerover", handlePointerOver, { passive: true });
    document.addEventListener("pointerout", handlePointerOut, { passive: true });
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener("blur", clearHoveredElement);

    return () => {
      document.removeEventListener("scroll", handleDocumentScroll, { capture: true });
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("scroll", handleWindowScroll);
      window.removeEventListener("blur", clearHoveredElement);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      clearHoveredElement();
      for (const [element, timer] of idleTimers) {
        window.clearTimeout(timer);
        element.classList.remove(SCROLLING_CLASS_NAME);
      }
      queuedElements.clear();
      idleTimers.clear();
    };
  }, []);

  return null;
}
