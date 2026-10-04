import { createHashRouter, RouterProvider } from "react-router";
import { HomePage } from "@/pages/home";

const router = createHashRouter([
  {
    path: "/",
    element: <HomePage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
