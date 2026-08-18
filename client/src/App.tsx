/** Style: 夜蝕都市 Neo-noir editorial；所有路由維持煤黑底與氧化金焦點。 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Home /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
