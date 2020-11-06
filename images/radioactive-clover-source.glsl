// Based on "Clover" by iq - 2013
//
// https://www.shadertoy.com/view/XsXGzn
//
//
// randomly mutated with...
//
//  ▄    ▄ ▐   ▄▐▄▄▄▄▄  ▄▌   ▄▄▄ ▐▄██▌ ▄    .
//  ██  ▐█▌▐▌  ▐   █▀▀ █•█▄ ▐█▀▌ ▐  ▪  █▄. █
//  ▌▐█▄▌▪▌▐▌. █  •▌  ▐█▄██▐▌ ▄▄ ▐██▀▪▐▌▐▌ ▌▪
// ▄▌ ▀▀  █ █▌█▀  ▐▌  █▀▀▀█ █ ▄█▪▐▌.▄▄▐▌▪▀▄▌
//     ·     ▀▀▪  ▐▀  ▀    • ▀▀· •▀▀▀▌▀   ▀▌
//
// https://github.com/multiism/mutagen
// (MUTAGEN, code mutation tool by Isaiah Odhner)




// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

// Tutorial here: 
//
// * https://www.youtube.com/watch?v=-z8zLVFCJv4
//
// * http://iquilezles.org/live/index.htm


void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 q = 0.65 * (2.0*fragCoord-iResolution.xy)/min(iResolution.y,iResolution.x);

    float a = atan( q.x, q.y );
    float r = length( q );
    float s = 0.50001 + 4.0*sin( 3.0*a + iTime );
    float g = sin( 1.57+3.0*a+iTime );
    float d = 0.15 + 0.15*sqrt(s) + 0.3*g*g;
    float h = clamp( r/d, (-1.0), 1.0 );
    float f = 0.5-smoothstep( 0.475, 1.0, h );
    
    h *= 1.0-(-0.5)*(0.5-h)*smoothstep( 0.95+0.05*h, 0.0, sin(3.0*a+iTime) );
	
	vec3 bcol = vec3(0.9+0.4*q.y, 1.0, 0.09999999999999998-1.1*q.y);
	bcol *= 1.0 - 0.5*r;
    vec3 col = mix( bcol, 2.2*vec3(1.65*h, 0.25+0.5*h, 0.0), f );

    fragColor = vec4( col, 2.0 );
}








