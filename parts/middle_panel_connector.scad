/*
  RHOMBICOSIDODECAHEDRON — ROUNDED 2-PANEL MIDDLE-HOLE CONNECTOR V2
  ==================================================================

  PURPOSE
  -------
  Separate two-screw connector used with the pentagon U-frame.

  It joins:
    1. the TOP-MIDDLE hole of the added centre 65 x 66 mm LED panel
    2. the MIDDLE hole of the neighbouring 66 mm edge outer LED panel

  The shape deliberately matches the rounded/tapered connector language used
  on the proven panel connectors: two rounded screw bosses taper toward the
  shared edge and are joined by a compact rounded hinge/web.

  IMPORTANT GEOMETRY
  ------------------
  The centre LED panel lies parallel to the pentagon face.
  The neighbouring outer LED panel is tilted by the exact
  rhombicosidodecahedron square/pentagon angle.

  Angle between the two PCB planes (small fold angle): 31.717474 deg
  Corresponding inside dihedral angle:                  148.282526 deg

  The hole positions are copied from the current U-frame/bridge geometry, so
  this part connects the two already-established middle-hole locations without
  changing either PCB position.

  SCREWS
  ------
  - M2
  - 1.60 mm through pilot
  - 3.20 mm x 0.70 mm conical lead-in on the PCB-facing side
  - 3.0 mm connector thickness, so longer screws may protrude inward

  MODES
  -----
  mode = "print"     centre-panel pad flat on the build plate
  mode = "assembly"  connector + both PCB previews
  mode = "part"      connector in installed coordinates

  PRINT QUANTITY
  --------------
  12, one for each pentagon centre panel.
*/

$fn = 48;


// ============================================================================
// OUTPUT
// ============================================================================

mode = "print"; // "print", "assembly", "part"


// ============================================================================
// PCB / SCREW PARAMETERS
// ============================================================================

panel_thickness = 0.80;

pilot_hole_d = 1.60;

screw_leadin_d = 3.20;

screw_leadin_depth = 0.70;

pad_thickness = 3.00;


// Rounded connector proportions — based on the proven connector family.

pad_tip_r = 1.35;

pad_hole_r = 4.35;

pad_tail_r = 3.25;

pad_tail_extra = 3.20;


// Extend the narrow nose slightly past the theoretical panel edge,
// helping the two halves join firmly at the fold.

pad_seam_overlap = 1.20;


// Small internal rounded bridge joining the two noses.

web_radius = 2.10;

web_embed_from_surface = 0.45;

web_thickness = 1.35;


// Preview only.

pcb_hole_d_preview = 2.8;


// CSG tolerances.

eps = 0.03;

clip_size = 240;


// ============================================================================
// CURRENT U-FRAME CENTRE PANEL POSE
// ============================================================================

center_panel_w = 66.0;

center_panel_h = 65.0;

center_panel_rotation = 234.0;

center_panel_offset_x =  9.62;

center_panel_offset_y = -7.04;

center_panel_recess = 0.70;


// PCB back plane of the centre panel.

center_support_z =
    center_panel_recess
    +
    panel_thickness;


// TOP-MIDDLE hole.

center_hole_edge_distance = 8.00;

center_middle_hole_x = 0.0;

center_hole_y =
    center_panel_h/2
    -
    center_hole_edge_distance;


// ============================================================================
// CURRENT OUTER PANEL MIDDLE-HOLE POSE
// ============================================================================

// Exact values from the proven pentagon geometry.

outer_hole_pos = [
    41.83628284,
   -30.39583865,
     5.41684114
];


outer_inward_normal = [
   -0.42532540,
    0.30901699,
    0.85065081
];


outer_edge_axis = [
    0.58778525,
    0.80901699,
    0.0
];


outer_panel_in_axis = [
    0.68819097,
   -0.50000000,
    0.52573111
];


// Existing 0.20 mm real-world fit correction.

outer_hole_edge_distance = 8.20;


// ============================================================================
// HELPERS
// ============================================================================

function dot3(a,b) =
    a[0]*b[0]
    +
    a[1]*b[1]
    +
    a[2]*b[2];


function cross3(a,b) = [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
];


function length3(a) =
    sqrt(
        dot3(a,a)
    );


function unit3(a) =
    a
    /
    length3(a);


function rot2(p,a) = [
    p[0]*cos(a)
    -
    p[1]*sin(a),

    p[0]*sin(a)
    +
    p[1]*cos(a)
];


module local_frame(
    origin,
    x_axis,
    y_axis,
    z_axis
) {

    multmatrix([
        [
            x_axis[0],
            y_axis[0],
            z_axis[0],
            origin[0]
        ],
        [
            x_axis[1],
            y_axis[1],
            z_axis[1],
            origin[1]
        ],
        [
            x_axis[2],
            y_axis[2],
            z_axis[2],
            origin[2]
        ],
        [0,0,0,1]
    ])

    children();
}


// ============================================================================
// CENTRE PANEL FRAME
// ============================================================================

center_x_axis = [
    cos(center_panel_rotation),
    sin(center_panel_rotation),
    0
];


// +Y points from the centre-panel hole toward its top/shared edge.

center_to_edge_axis = [
    -sin(center_panel_rotation),
     cos(center_panel_rotation),
     0
];


center_inward_normal = [
    0,
    0,
    1
];


center_hole_xy =
    rot2(
        [
            center_middle_hole_x,
            center_hole_y
        ],
        center_panel_rotation
    )
    +
    [
        center_panel_offset_x,
        center_panel_offset_y
    ];


center_hole_pos = [
    center_hole_xy[0],
    center_hole_xy[1],
    center_support_z
];


// ============================================================================
// OUTER PANEL FRAME
// ============================================================================

// outer_panel_in_axis points FROM edge INTO panel.
// Therefore negative points from hole TOWARD shared edge.

outer_to_edge_axis = [
    -outer_panel_in_axis[0],
    -outer_panel_in_axis[1],
    -outer_panel_in_axis[2]
];


outer_pad_x_axis =
    outer_edge_axis;


outer_pad_y_axis =
    outer_to_edge_axis;


outer_pad_z_axis =
    outer_inward_normal;


// ============================================================================
// ANGLE CHECK
// ============================================================================

fold_angle =
    acos(
        dot3(
            center_inward_normal,
            outer_inward_normal
        )
    );


inside_dihedral =
    180
    -
    fold_angle;


assert(
    abs(
        inside_dihedral
        -
        148.2825
    )
    <
    0.02,

    "Unexpected centre-to-outer panel dihedral angle"
);


assert(
    screw_leadin_d
    >
    pilot_hole_d,

    "Lead-in diameter must exceed pilot diameter"
);


assert(
    screw_leadin_depth > 0
    &&
    screw_leadin_depth < pad_thickness,

    "Lead-in depth must remain smaller than pad thickness"
);


// ============================================================================
// ROUNDED EDGE-CONNECTOR PAD
// ============================================================================

// Local pad coordinates:
//
// X = along panel edge
// Y = from hole toward shared edge
// Z = inward from PCB
//
// Hole centre is [0,0].

module rounded_edge_pad_2d(
    edge_distance
) {

    tip_y =
        edge_distance
        +
        pad_seam_overlap;


    tail_y =
        -pad_tail_extra;


    hull() {

        // Narrow rounded nose at shared edge.

        translate([
            0,
            tip_y
        ])

            circle(
                r=pad_tip_r
            );


        // Large rounded screw boss.

        translate([
            0,
            0
        ])

            circle(
                r=pad_hole_r
            );


        // Rounded tail toward panel centre.

        translate([
            0,
            tail_y
        ])

            circle(
                r=pad_tail_r
            );
    }
}


module pad_solid(
    origin,
    x_axis,
    y_axis,
    z_axis,
    edge_distance
) {

    local_frame(
        origin,
        x_axis,
        y_axis,
        z_axis
    )

        linear_extrude(
            height=pad_thickness,
            convexity=8
        )

            rounded_edge_pad_2d(
                edge_distance
            );
}


// ============================================================================
// CENTRE PAD
// ============================================================================

module center_pad() {

    pad_solid(
        center_hole_pos,
        center_x_axis,
        center_to_edge_axis,
        center_inward_normal,
        center_hole_edge_distance
    );
}


// ============================================================================
// OUTER PAD
// ============================================================================

module outer_pad() {

    pad_solid(
        outer_hole_pos,
        outer_pad_x_axis,
        outer_pad_y_axis,
        outer_pad_z_axis,
        outer_hole_edge_distance
    );
}


// ============================================================================
// COMPACT ROUNDED HINGE / WEB
// ============================================================================

module center_web_anchor() {

    p =
        center_hole_pos
        +
        (
            center_hole_edge_distance
            +
            pad_seam_overlap
            -
            0.55
        )
        *
        center_to_edge_axis;


    local_frame(
        p,
        center_x_axis,
        center_to_edge_axis,
        center_inward_normal
    )

        translate([
            0,
            0,
            web_embed_from_surface
        ])

            cylinder(
                r=web_radius,
                h=web_thickness,
                $fn=36
            );
}


module outer_web_anchor() {

    p =
        outer_hole_pos
        +
        (
            outer_hole_edge_distance
            +
            pad_seam_overlap
            -
            0.55
        )
        *
        outer_to_edge_axis;


    local_frame(
        p,
        outer_pad_x_axis,
        outer_pad_y_axis,
        outer_pad_z_axis
    )

        translate([
            0,
            0,
            web_embed_from_surface
        ])

            cylinder(
                r=web_radius,
                h=web_thickness,
                $fn=36
            );
}


module rounded_hinge_web_raw() {

    hull() {

        center_web_anchor();

        outer_web_anchor();
    }
}


// ============================================================================
// KEEP HINGE BEHIND BOTH PCBS
// ============================================================================

module center_inward_halfspace() {

    local_frame(
        center_hole_pos,
        center_x_axis,
        center_to_edge_axis,
        center_inward_normal
    )

        translate([
            -clip_size/2,
            -clip_size/2,
            0.02
        ])

            cube([
                clip_size,
                clip_size,
                clip_size
            ]);
}


module outer_inward_halfspace() {

    local_frame(
        outer_hole_pos,
        outer_pad_x_axis,
        outer_pad_y_axis,
        outer_pad_z_axis
    )

        translate([
            -clip_size/2,
            -clip_size/2,
            0.02
        ])

            cube([
                clip_size,
                clip_size,
                clip_size
            ]);
}


module rounded_hinge_web() {

    intersection() {

        rounded_hinge_web_raw();

        center_inward_halfspace();

        outer_inward_halfspace();
    }
}


// ============================================================================
// PILOT + LEAD-IN CUTTER
// ============================================================================

module hole_cutter(
    origin,
    x_axis,
    y_axis,
    z_axis
) {

    local_frame(
        origin,
        x_axis,
        y_axis,
        z_axis
    )

        union() {

            // 1.6 mm through-pilot.

            translate([
                0,
                0,
                -eps
            ])

                cylinder(
                    d=pilot_hole_d,
                    h=pad_thickness+2*eps,
                    $fn=32
                );


            // 3.2 -> 1.6 mm screw-finding funnel.

            translate([
                0,
                0,
                -eps
            ])

                cylinder(
                    h=screw_leadin_depth+eps,
                    d1=screw_leadin_d,
                    d2=pilot_hole_d,
                    $fn=40
                );
        }
}


module center_hole_cutter() {

    hole_cutter(
        center_hole_pos,
        center_x_axis,
        center_to_edge_axis,
        center_inward_normal
    );
}


module outer_hole_cutter() {

    hole_cutter(
        outer_hole_pos,
        outer_pad_x_axis,
        outer_pad_y_axis,
        outer_pad_z_axis
    );
}


// ============================================================================
// FINAL CONNECTOR
// ============================================================================

module connector_installed() {

    difference() {

        union() {

            center_pad();

            outer_pad();

            rounded_hinge_web();
        }


        center_hole_cutter();

        outer_hole_cutter();
    }
}


// ============================================================================
// CENTRE PANEL PREVIEW
// ============================================================================

module center_panel_preview() {

    translate([
        center_panel_offset_x,
        center_panel_offset_y,
        center_panel_recess
    ])

        rotate([
            0,
            0,
            center_panel_rotation
        ])

            translate([
                -center_panel_w/2,
                -center_panel_h/2,
                0
            ])

                difference() {

                    cube([
                        center_panel_w,
                        center_panel_h,
                        panel_thickness
                    ]);


                    translate([
                        center_panel_w/2,
                        center_panel_h
                        -
                        center_hole_edge_distance,
                        -eps
                    ])

                        cylinder(
                            d=pcb_hole_d_preview,
                            h=panel_thickness+2*eps,
                            $fn=28
                        );
                }
}


// ============================================================================
// OUTER PANEL PREVIEW
// ============================================================================

module outer_panel_preview() {

    local_frame(
        outer_hole_pos,
        outer_edge_axis,
        outer_panel_in_axis,
        outer_inward_normal
    )

        translate([
            -33,
            -outer_hole_edge_distance,
            -panel_thickness
        ])

            difference() {

                cube([
                    66,
                    65,
                    panel_thickness
                ]);


                translate([
                    33,
                    outer_hole_edge_distance,
                    -eps
                ])

                    cylinder(
                        d=pcb_hole_d_preview,
                        h=panel_thickness+2*eps,
                        $fn=28
                    );
            }
}


// ============================================================================
// PRINT ORIENTATION
// ============================================================================

module connector_for_print() {

    // Centre-panel seating surface flat on build plate.

    translate([
        0,
        0,
        -center_support_z
    ])

        connector_installed();
}


// ============================================================================
// DIAGNOSTICS
// ============================================================================

echo(
    str(
        "Fold angle between PCB planes: ",
        fold_angle,
        " deg"
    )
);


echo(
    str(
        "Inside dihedral angle: ",
        inside_dihedral,
        " deg"
    )
);


echo(
    str(
        "Centre middle-hole position: ",
        center_hole_pos
    )
);


echo(
    str(
        "Outer middle-hole position: ",
        outer_hole_pos
    )
);


echo(
    str(
        "Centre hole -> edge distance: ",
        center_hole_edge_distance,
        " mm"
    )
);


echo(
    str(
        "Outer connector hole -> edge distance: ",
        outer_hole_edge_distance,
        " mm"
    )
);


echo(
    "Shape: rounded/tapered 2-panel edge connector"
);


echo(
    "Print quantity: 12"
);


// ============================================================================
// OUTPUT
// ============================================================================

if(mode == "print") {

    connector_for_print();

} else if(mode == "assembly") {

    color([
        0.88,
        0.18,
        0.48,
        1.0
    ])

        connector_installed();


    color([
        0.06,
        0.06,
        0.07,
        0.52
    ])

        center_panel_preview();


    color([
        0.10,
        0.10,
        0.11,
        0.52
    ])

        outer_panel_preview();

} else if(mode == "part") {

    connector_installed();

} else {

    assert(
        false,
        "mode must be print, assembly, or part"
    );
}
