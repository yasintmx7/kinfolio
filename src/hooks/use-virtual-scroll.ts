import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lightweight virtual scroll for a fixed-height scrollable container.
 *
 * Renders only the rows visible in the viewport plus `overscan` rows above and
 * below. Two spacer divs above/below the rendered slice maintain the full
 * scroll height so the browser scrollbar is accurate.
 *
 * No external dependencies. Works with any consistent or estimated row height.
 *
 * @example
 * const { containerRef, virtualRows, topSpacerPx, bottomSpacerPx } =
 *   useVirtualScroll({ rowCount: rows.length, rowHeightPx: 68 });
 *
 * return (
 *   <div ref={containerRef} className="overflow-y-auto max-h-96">
 *     <div style={{ height: topSpacerPx }} />
 *     {virtualRows.map(({ index }) => <Row key={index} data={rows[index]} />)}
 *     <div style={{ height: bottomSpacerPx }} />
 *   </div>
 * );
 */
export function useVirtualScroll({
  rowCount,
  rowHeightPx,
  overscan = 5,
}: {
  rowCount: number;
  /** Estimated or exact height of each row in pixels */
  rowHeightPx: number;
  /** Extra rows to render above/below the visible window */
  overscan?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Update containerHeight on mount and whenever the container resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setContainerHeight(el.clientHeight);
      setScrollTop(el.scrollTop);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);

    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  const totalHeight = rowCount * rowHeightPx;

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / rowHeightPx) - overscan,
  );
  const visibleCount = Math.ceil(containerHeight / rowHeightPx);
  const endIndex = Math.min(
    rowCount - 1,
    startIndex + visibleCount + overscan * 2,
  );

  const virtualRows: { index: number }[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    virtualRows.push({ index: i });
  }

  const topSpacerPx = startIndex * rowHeightPx;
  const bottomSpacerPx = Math.max(
    0,
    totalHeight - topSpacerPx - virtualRows.length * rowHeightPx,
  );

  /** Call this to programmatically scroll to a specific row index */
  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTop = Math.max(
        0,
        index * rowHeightPx - containerHeight / 2 + rowHeightPx / 2,
      );
    },
    [rowHeightPx, containerHeight],
  );

  return {
    containerRef,
    virtualRows,
    topSpacerPx,
    bottomSpacerPx,
    scrollToIndex,
    totalHeight,
  };
}
