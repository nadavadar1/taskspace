import { SpaceView } from "@/components/SpaceView";

export default async function Page({ params }: PageProps<"/space/[id]">) {
  const { id } = await params;
  return <SpaceView id={Number(id)} />;
}
