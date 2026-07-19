import SurveyView from "./SurveyView";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SurveyView token={token} />;
}
