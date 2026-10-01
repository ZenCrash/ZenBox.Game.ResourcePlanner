"use client";
import { useRef } from "react";

/** Keep derived subscriptions stable when only graph geometry changed. */
export function useStableValues<T>(values: T[], equal: (a: T, b: T) => boolean = Object.is) {
  const previous = useRef(values);
  if (previous.current.length !== values.length || values.some((value, index) => !equal(value, previous.current[index])))
    previous.current = values;
  return previous.current;
}
