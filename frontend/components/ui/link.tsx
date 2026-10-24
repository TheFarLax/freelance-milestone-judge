import NextLink from "next/link";
import * as React from "react";

export interface LinkProps
  extends Omit<React.ComponentProps<typeof NextLink>, "href"> {
  href: string;
}

export function Link({ className, href, children, ...props }: LinkProps) {
  return (
    <NextLink
      href={href}
      className={`${className ?? ""}`}
      {...props}
    >
      {children}
    </NextLink>
  );
}
