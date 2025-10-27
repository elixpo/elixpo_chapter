// source.config.ts
import { defineCollections, frontmatterSchema, metaSchema } from "fumadocs-mdx/config";
var docs = defineCollections({
  type: "doc",
  dir: "content/docs",
  schema: frontmatterSchema
});
var meta = defineCollections({
  type: "meta",
  dir: "content/docs",
  schema: metaSchema
});
export {
  docs,
  meta
};
