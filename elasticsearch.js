/* jshint indent: 2, asi: true */
// vim: noai:ts=2:sw=2

var pluginName    = 'search'

var _             = require('underscore');
var assert        = require('assert')
var elasticsearch = require('elasticsearch')

function search(options) {
  var options = options || {};
  var seneca = this;

  // Apply defaults individually,
  // instead of all-or-nothing.
  var connectionOptions = options.connection || {};

  _.defaults(connectionOptions, {
    host          : 'localhost:9200',
    sniffInterval : 300000,
    sniffOnStart  : true,
    log           : 'error'
  });

  var esClient = new elasticsearch.Client(connectionOptions);

  var indexes = {}

  seneca.add({role: pluginName, cmd: 'create-index'}, function(args, callback) {
    var indexName = args.index

    esClient.indices.exists({index: indexName}, function(err, exists) {
      if(err || exists) {
        return callback(err)
      } else {
        esClient.indices.create({index: indexName}, function(err) {
          callback(err)
        })
      }
    })

  })

  seneca.add({role: pluginName, cmd: 'save'}, function(args, callback) {

    assert.ok(args.data, 'missing args.data')
    var dataType = args.type || args.data.entity$
    assert.ok(dataType, 'expected either "type" or "data.entity$" to deduce the entity type')

    esClient.index({
      index: args.index,
      type: dataType,
      id: args.data.id,
      refresh: options.refreshOnSave,
      body: args.data
    }, function (err, resp) {
      if(err) {
        console.error(err)
      }
      callback(err)
    })

  })

  seneca.add({role: pluginName, cmd: 'delete'}, function(args, callback) {
    callback(undefined)
  })

  return {
    name: pluginName,
    native: esClient
  }
}

module.exports = search
