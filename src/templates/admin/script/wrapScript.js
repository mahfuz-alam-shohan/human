export const wrapScriptTag = (sections) => `
  <script>
${sections.join('\n')}
  </script>
`;
