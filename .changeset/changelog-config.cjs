const github = require("@changesets/changelog-github");

const base = github.default || github;

module.exports = {
	getReleaseLine: async (changeset, type, options) => {
		const line = await base.getReleaseLine(changeset, type, options);
		return line.replace(/ Thanks \[@[^\]]+\]\([^)]+\)!/, "");
	},
	getDependencyReleaseLine: base.getDependencyReleaseLine,
};
