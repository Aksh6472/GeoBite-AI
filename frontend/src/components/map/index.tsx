"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "../ui";

// Leaflet touches `window`; load map components on the client only.
export const IntelligenceMap = dynamic(() => import("./IntelligenceMap"), { ssr: false, loading: () => <Skeleton className="h-[620px] w-full" /> });
export const LocationPicker = dynamic(() => import("./LocationPicker"), { ssr: false, loading: () => <Skeleton className="h-[320px] w-full" /> });
export const PublicMap = dynamic(() => import("./PublicMap"), { ssr: false, loading: () => <Skeleton className="h-[420px] w-full" /> });
export const PointsMap = dynamic(() => import("./PointsMap"), { ssr: false, loading: () => <Skeleton className="h-[360px] w-full" /> });
export type { LayerKey } from "./IntelligenceMap";
