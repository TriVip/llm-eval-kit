import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import {
  ArtifactPage,
  ArtifactsPage,
  CasePage,
  ComparePage,
  LiveRunPage,
  NewRunPage,
  NotFoundPage,
  OverviewPage,
  ReviewPage,
} from "./pages.js";
import { AppShell } from "./shell.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "runs/new", element: <NewRunPage /> },
      { path: "runs/:runId", element: <LiveRunPage /> },
      { path: "artifacts", element: <ArtifactsPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "review", element: <ReviewPage /> },
      { path: "artifacts/:artifactId", element: <ArtifactPage /> },
      { path: "artifacts/:artifactId/cases/:caseId", element: <CasePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
