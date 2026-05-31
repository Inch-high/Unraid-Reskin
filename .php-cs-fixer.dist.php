<?php

// PHP-CS-Fixer configuration — formats the server-side PHP layer.
//
// Scope: the Unraid plugin's PHP endpoints (package/include) and their unit
// tests (tests/unit-php). Ruleset is PSR-12 plus a handful of low-risk tidy
// rules. Run via `npm run format:php` (rewrites) or `npm run lint:php`
// (check-only; this is what CI gates on).
//
// PHP 8.2 is the target runtime (matches Unraid 7.x).

$finder = PhpCsFixer\Finder::create()
    ->in(__DIR__ . '/package/include')
    ->in(__DIR__ . '/tests/unit-php')
    ->name('*.php');

return (new PhpCsFixer\Config())
    ->setRiskyAllowed(false)
    ->setRules([
        '@PSR12' => true,
        // Tidy-ups that don't change semantics:
        'array_syntax' => ['syntax' => 'short'],
        'no_unused_imports' => true,
        'ordered_imports' => ['sort_algorithm' => 'alpha'],
        'single_quote' => true,
        'trailing_comma_in_multiline' => ['elements' => ['arrays']],
        'no_trailing_whitespace' => true,
        'no_whitespace_in_blank_line' => true,
        'blank_line_after_opening_tag' => true,
    ])
    ->setFinder($finder);
