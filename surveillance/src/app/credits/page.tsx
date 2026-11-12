import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { DEMO_PHOTOS } from "@/lib/demoPhotos";

export const metadata: Metadata = { title: "Photo credits" };

export default function CreditsPage() {
  return (
    <>
      <PageHeader
        title="Photo credits"
        subtitle="The demo sightings use real photos of free-ranging dogs in India from Wikimedia Commons. Each photo was cropped around the dog to 160 px; the crops keep the original licence. They illustrate the demo only and were not taken at the sample cameras."
      />
      <Card>
        <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {DEMO_PHOTOS.map((p) => (
            <li key={p.src} className="flex gap-3 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.title} width={64} height={64} className="size-16 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 text-[12.5px] leading-snug">
                <a href={p.source} target="_blank" rel="noreferrer" className="block truncate font-medium text-navy-700 hover:underline">{p.title}</a>
                <p className="truncate text-muted">by {p.author}</p>
                <p className="text-muted">{p.licenseUrl ? <a href={p.licenseUrl} target="_blank" rel="noreferrer license" className="hover:underline">{p.license}</a> : p.license} · cropped</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-4 text-xs text-muted">Map data &copy; OpenStreetMap contributors (ODbL). Satellite imagery &copy; Esri, Maxar, Earthstar Geographics. Dog detector: TensorFlow.js COCO-SSD (Apache-2.0).</p>
    </>
  );
}
