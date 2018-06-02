# ivan

Ivan is a JavaScript runtime which has native ES Modules and shares many browser spec globals.

A lot of code in Ivan is inspired from other codebases. Those codebases will be linked at the top of the individual files.

My #1 priority right now is to figure out a stable way to port tests from the [Web Platform Tests][]
to be runnable by ivan's test system.
There are thousands of these tests and the gross majority of them are wrapped in html.
If you can think of a clever way to run them with no/mininmal modification please please please
hit me up with a pr or issue or tweet or whatever because i really need to start testing things.

##### In Progress

- W3C Web Performance Timing API (`performance.now()` works :D)
- W3C Web Cryptography API
- WHATWG Encoding (decoder has weird bugs i haven't had time to dig into)
- WHATWG Fetch (needed for http imports)
- WHATWG URL


##### Planned

- WHATWG Streams (needed for fetch)


### Finished

- WHATWG Console
- WHATWG Events
- WHATWG Timers (could use some optimisation)

[Web Platform Tests]: https://github.com/web-platform-tests/wpt
