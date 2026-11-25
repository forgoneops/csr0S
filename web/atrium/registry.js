/* One registry for the Atrium's views: a script registers the views it adds instead of assigning OG[...] itself.
   A duplicate module id, or a view another module has claimed in `owns`, throws at load, before the page draws. */
const OG_MODULES = new Map();   // module id -> its view names
const OG_OWNERS = new Map();    // view name -> the module id that owns it

function register({ id, views = {}, owns = [] }) {
  if (OG_MODULES.has(id)) throw new Error(`Atrium registry: module "${id}" is registered twice`);
  for (const name of [...owns, ...Object.keys(views)]) {
    const owner = OG_OWNERS.get(name);
    if (owner && owner !== id) throw new Error(`Atrium registry: view "${name}" is owned by "${owner}", not "${id}"`);
  }
  for (const name of owns) OG_OWNERS.set(name, id);
  OG_MODULES.set(id, Object.keys(views));
  Object.assign(OG, views);
}
