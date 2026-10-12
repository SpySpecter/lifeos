import { createCn } from "cn/config";

/**
 * `cn` mit den iOS-Textstilen aus globals.css. Ohne diese Angabe hält der Merger z. B. `text-title1`
 * für eine Farbe und wirft es weg, sobald `text-critical` dazukommt.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ["caption2", "caption", "footnote", "subhead", "body", "title3", "title2", "title1", "largetitle"],
    },
  },
});
