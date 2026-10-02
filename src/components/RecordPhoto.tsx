import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { loadServerRecordPhoto } from "../api";

const photoCache = new Map<string, string>();
const queue: Array<() => void> = [];
let active = 0;
const MAX_CONCURRENT_LOADS = 3;

function enqueue(task: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const run = () => {
      active += 1;
      void task().finally(() => {
        active -= 1;
        queue.shift()?.();
        resolve();
      });
    };
    if (active < MAX_CONCURRENT_LOADS) run(); else queue.push(run);
  });
}

type Props = { recordId: string; name: string; className?: string; onPhoto?: (url: string) => void };

export default function RecordPhoto({ recordId, name, className = "", onPhoto }: Props) {
  const [photo, setPhoto] = useState(() => photoCache.get(recordId) || "");
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (photoCache.has(recordId)) {
      const cached = photoCache.get(recordId) || "";
      setPhoto(cached);
      onPhoto?.(cached);
      return;
    }
    const node = elementRef.current;
    if (!node) return;
    let cancelled = false;
    const load = () => enqueue(async () => {
      try {
        const url = await loadServerRecordPhoto(recordId);
        photoCache.set(recordId, url);
        if (!cancelled) { setPhoto(url); onPhoto?.(url); }
      } catch { photoCache.set(recordId, ""); }
    });
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "160px" });
    observer.observe(node);
    return () => { cancelled = true; observer.disconnect(); };
  }, [recordId, onPhoto]);

  return <span ref={elementRef} className={`${className} cokifimi-record-photo`}>{photo ? <img src={photo} alt={`Foto de ${name}`} loading="lazy" /> : <UserRound aria-hidden="true" />}</span>;
}