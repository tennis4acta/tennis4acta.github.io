module.exports = function(grunt) {

    // Base name of the theme assets in less/, css/ and js/.
    var name = 'clean-blog';

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        uglify: {
            main: {
                src: 'js/' + name + '.js',
                dest: 'js/' + name + '.min.js'
            }
        },
        less: {
            expanded: {
                options: {
                    paths: ['css']
                },
                files: {
                    'css/<%= name %>.css': 'less/<%= name %>.less'
                }
            },
            minified: {
                options: {
                    paths: ['css'],
                    compress: true
                },
                files: {
                    'css/<%= name %>.min.css': 'less/<%= name %>.less'
                }
            }
        },
        name: name,
        banner: '/*!\n' +
            ' * Clean Blog (https://github.com/IronSummitMedia/startbootstrap-clean-blog-jekyll)\n' +
            ' * Copyright <%= grunt.template.today("yyyy") %> Start Bootstrap\n' +
            ' * Licensed under Apache 2.0 (https://github.com/IronSummitMedia/startbootstrap/blob/gh-pages/LICENSE)\n' +
            ' */\n',
        usebanner: {
            dist: {
                options: {
                    position: 'top',
                    banner: '<%= banner %>'
                },
                files: {
                    src: ['css/<%= name %>.css', 'css/<%= name %>.min.css', 'js/<%= name %>.min.js']
                }
            }
        },
        watch: {
            scripts: {
                files: ['js/' + name + '.js'],
                tasks: ['uglify'],
                options: {
                    spawn: false
                }
            },
            less: {
                files: ['less/*.less'],
                tasks: ['less'],
                options: {
                    spawn: false
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-banner');
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.registerTask('default', ['uglify', 'less', 'usebanner']);

};
