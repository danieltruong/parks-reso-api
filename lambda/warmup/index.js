const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

const id = uuidv4();

const configDefaults = {
    funcName: null,
    funcVersion: null,
    concurrency: 'concurrency', // default concurrency field
    test: 'test', // default test flag
    log: true, // default logging to true
    correlationId: id, // default the correlationId
    delay: 75 // default the delay to 75ms
}

exports.handler = async (event, cfg = {}) => {

    let config = Object.assign({}, configDefaults, cfg);

    if (event && event[config.funcName] && event[config.funcVersion]) {

        let concurrency = event[config.concurrency]
            && !isNaN(event[config.concurrency])
            && event[config.concurrency] > 1
            ? event[config.concurrency] : 1;

        let invokeCount = event['__WARMER_INVOCATION__']
            && !isNaN(event['__WARMER_INVOCATION__'])
            ? event['__WARMER_INVOCATION__'] : 1;

        let invokeTotal = event['__WARMER_CONCURRENCY__']
            && !isNaN(event['__WARMER_CONCURRENCY__'])
            ? event['__WARMER_CONCURRENCY__'] : concurrency;

        let correlationId = event['__WARMER_CORRELATIONID__']
            ? event['__WARMER_CORRELATIONID__'] : config.correlationId;

        // Create log record
        let log = {
            action: 'warmer',
            function: event[config.funcName] + ':' + event[config.funcVersion],
            id,
            correlationId,
            count: invokeCount,
            concurrency: invokeTotal,
            warm,
            lastAccessed: lastAccess,
            lastAccessedSeconds: lastAccess === null ? null : ((Date.now() - lastAccess) / 1000).toFixed(1)
        };

        // Log it
        if (event[config.log]) {
            console.log(log);
        }

        // Fan out if concurrency is set higher than 1
        if (concurrency > 1 && !event[config.test]) {
            // init promise array
            let invocations = [];

            // loop through concurrency count
            for (let i = 2; i <= concurrency; i++) {

                // Set the params and wait for the final function to finish
                let params = {
                    FunctionName: event[config.funcName] + ':' + event[config.funcVersion],
                    InvocationType: i === concurrency ? 'RequestResponse' : 'Event',
                    LogType: 'None',
                    Payload: Buffer.from(JSON.stringify({
                        '__WARMER_INVOCATION__': i, // send invocation number
                        '__WARMER_CONCURRENCY__': concurrency, // send total concurrency
                        '__WARMER_CORRELATIONID__': correlationId // send correlation id
                    }))
                };

                // Add promise to invocations array
                invocations.push(lambda.invoke(params).promise());

            } // end for

            // Invoke concurrent functions
            await Promise.all(invocations);
        } else if (invokeCount > 1) {
            await new Promise(r => setTimeout(r, config.delay));
        }
    }
} // end module