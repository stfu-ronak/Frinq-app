import type { Metadata } from "next";
import "./globals.css";
import Tracker from "@/app/components/Tracker";
import Script from "next/script";

export const metadata: Metadata = {
  title: "frinq. find your frinq.",
  description: "The friend-matching questionnaire.",
  icons: {
    icon: [{ url: "/fq-logo.png", type: "image/png" }],
    apple: [{ url: "/fq-logo.png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <Tracker />
        {children}
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-7BN8HGKFQE"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-7BN8HGKFQE');
          `}
        </Script>
        {/* Microsoft Clarity */}
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "wujyb8fexf");
          `}
        </Script>
      </body>
    </html>
  );
}
