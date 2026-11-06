import HomePage from "@/components/home/HomePage";
import { APP_TITLE } from "@/lib/app-config";

const SEO_TITLE = "BlueprintOS — check every clearance, seal it with proof";
const SEO_DESCRIPTION =
  "A floor-plan desk that measures drawings against the building code, stages cited redlines, and leaves applying and sealing to the architect.";

export function meta() {
  return [
    { title: SEO_TITLE },
    {
      name: "description",
      content: SEO_DESCRIPTION,
    },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function HomeRoute() {
  return <HomePage />;
}
