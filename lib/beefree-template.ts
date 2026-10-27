// Based on Beefree's official blank v2 email template. Keeping the starter
// local means the editor can initialize without calling the template catalog.
export const blankBeefreeTemplate = {
  page: {
    title: "",
    description: "",
    template: { name: "template-base", type: "basic", version: "0.0.1" },
    body: {
      type: "mailup-bee-page-proprerties",
      container: { style: { "background-color": "#f4f2f7" } },
      content: {
        style: { "font-family": "Arial, 'Helvetica Neue', Helvetica, sans-serif", color: "#101b24" },
        computedStyle: { linkColor: "#6736d8", messageBackgroundColor: "#ffffff", messageWidth: "600px" },
      },
    },
    rows: [
      {
        type: "one-column-empty",
        container: { style: { "background-color": "transparent" } },
        content: { style: { "background-color": "#ffffff", color: "#101b24", width: "600px" } },
        columns: [
          {
            "grid-columns": 12,
            modules: [{ type: "mailup-bee-newsletter-modules-empty", descriptor: {} }],
            style: {
              "background-color": "transparent",
              "padding-top": "5px",
              "padding-right": "0px",
              "padding-bottom": "5px",
              "padding-left": "0px",
              "border-top": "0px dotted transparent",
              "border-right": "0px dotted transparent",
              "border-bottom": "0px dotted transparent",
              "border-left": "0px dotted transparent",
            },
          },
        ],
      },
    ],
  },
};
