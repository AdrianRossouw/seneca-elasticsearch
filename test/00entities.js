/* jshint indent: 2, asi: true, unused: false */
/* global describe, it, before, beforeEach, after, afterEach */
// vim: noai:ts=2:sw=2

var assert         = require('assert');
var should         = require('should');
var elasticsearch  = require('elasticsearch');
var _              = require('underscore');

var seneca = require('seneca')({ strict: { add: false} });
var indexName = 'seneca-test-entity';

seneca.use('mem-store');

seneca.use('../elasticsearch.js', {
  // Using this option is ONLY acceptable in tests.
  refreshOnSave: true,
  entities: [{
    zone: undefined,
    base: undefined,
    name: 'foo',
    indexedAttributes: {
      'jobTitle': {
        type: 'string'
      },
      'configuredAnalyzer': {
        type: 'string',
        index: 'not_analyzed'
      }
    }
  }],
  connection: { index: indexName }
});

before(function(done) {
  seneca.ready(done);
});

describe('entities', function() {
  var fooId; // to hold the generated id
  var foo = seneca.make$('foo');
  var esClient = new elasticsearch.Client();

  after(function(done) {
    esClient.indices.delete({index: indexName})
      .then(done.bind(null, null))
      .catch(done);
  });

  it('should save entity', function(done) {
    foo.jobTitle = 'important sounding title';
    foo.passHash = 'DO NOT INDEX!';
    foo.save$(function(err, result) {
      assert.ok(!err, err);

      fooId = result.id;
      done(null);
    });
  });

  it('should generate an id if not provided', function() {
    assert.ok(fooId);
  });


  it('update', function(done) {
    foo.jobTitle += '_updated'
    foo.id = fooId;

    foo.save$(function(err, result) {
      assert.ok(!err, err);

      assert.equal(fooId, result.id);
      done(null);
    });
  });

  it('load', function(done) {

    // need to debounce for 50ms to let the data get indexed.
    _.delay(delayCb, 100);

    function delayCb() {
      var command = {
        role: 'search',
        cmd: 'load',
        index: indexName,
        type: 'foo',
        id: fooId
      };

      seneca.act(command, loadCb);
    }

    function loadCb(err, resp) {
      if (err) { return done(err); }

      assert.ok(resp.found);
      should.exist(resp._source);
      resp._id.should.eql(fooId);

      var src = resp._source;
      src.jobTitle.should.eql('important sounding title_updated');
      should.not.exist(src.passHash);
      should.exist(src.entity$);
      src.entity$.should.eql('-/-/foo');
      done();
    }
  });

  it('should remove the entity', function(done) {
    foo.remove$(fooId, throwOnError(done));
  });

  it('should not error when removing a non-existent entity', function(done) {
    foo.remove$(fooId, throwOnError(done));
  });

  describe('configured analyzer', function() {
    var foo = seneca.make$('foo');

    foo.jobTitle = 'important sounding title';
    foo.configuredAnalyzer = 'DO NOT ANALYZE';

    it('should save entity', function(done) {
      foo.save$(function(err, result) {
        assert.ok(!err, err);

        fooId = result.id;
        done(null);
      });
    });


    it('search', function(done) {

      // need to debounce for 50ms to let the data get indexed.
      _.delay(delayCb, 100);

      function delayCb() {
        var command = {
          role: 'search',
          cmd: 'search',
          index: indexName,
          type: 'foo',
          search: {
            "query": {
              "filtered": {
                "query": {
                  "match_all": {}
                },
                "filter": {
                  "term": {
                    "configuredAnalyzer": "DO NOT ANALYZE"
                  }
                }
              }
            }
          }
        };

        seneca.act(command, loadCb);
      }

      function loadCb(err, resp) {
        if (err) { return done(err); }
        should.exist(resp.hits);
        resp.hits.total.should.eql(1);

        var src = resp.hits.hits[0]._source;
        src.jobTitle.should.eql('important sounding title');
        src.configuredAnalyzer.should.eql('DO NOT ANALYZE');
        should.not.exist(src.passHash);
        should.exist(src.id);
        should.exist(src.entity$);
        src.entity$.should.eql('-/-/foo');
        done();
      }
    });
  });

});

function throwOnError(done) {
  return function(err) {
    if (err) { return done(err); }
    done();
  };
}
