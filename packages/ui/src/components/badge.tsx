import * as React from "react";
import { cn } from "@movie-explorer/ui/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border border-border bg-secondary px-2 text-xs font-medium text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
