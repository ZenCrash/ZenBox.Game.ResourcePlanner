export type PortRows = Record<string, number>;

export function initialPortRows(
  handles: string[],
  saved: PortRows = {},
): PortRows {
  const rows: PortRows = {};
  const occupied = new Set<number>();
  handles.forEach((handle, index) => {
    let row = saved[handle] ?? 3 + index * 2;
    while (occupied.has(row)) row++;
    rows[handle] = row;
    occupied.add(row);
  });
  return rows;
}

// Always preview from the original layout, never from the previous preview.
// Moving away therefore restores every displaced port until the drop commits.
export function previewPortMove(
  original: PortRows,
  dragged: string,
  pointerRow: number,
  minRow: number,
  maxRow: number,
): PortRows {
  const target = Math.max(minRow, Math.min(maxRow, Math.round(pointerRow)));
  const rows = { ...original };
  delete rows[dragged];
  const occupied = new Map(
    Object.entries(rows).map(([handle, row]) => [row, handle]),
  );
  if (occupied.has(target)) {
    let direction = pointerRow < target ? 1 : -1;
    const vacancy = (step: number) => {
      let row = target;
      while (row >= minRow && row <= maxRow && occupied.has(row)) row += step;
      return row >= minRow && row <= maxRow ? row : undefined;
    };
    let free = vacancy(direction);
    if (free === undefined) {
      direction *= -1;
      free = vacancy(direction);
    }
    if (free === undefined) return original;
    for (let row = free; row !== target; row -= direction) {
      const handle = occupied.get(row - direction)!;
      rows[handle] = row;
    }
  }
  rows[dragged] = target;
  return rows;
}
