module.exports = function (queryObj, doDetach) {
    return function removeRelations(err, assetGraph, cb) {
        assetGraph.findRelations(queryObj).forEach(function (relation) {
            if (doDetach) {
                assetGraph.detachAndRemoveRelation(relation);
            } else {
                assetGraph.removeRelation(relation);
            }
        });
        process.nextTick(cb);
    };
};