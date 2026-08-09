/*
  Rhombicosidodecahedron TRIANGLE filler — one screw per panel, PCB-safe gussets + screw lead-ins
  ==================================================================

  Print quantity: 20 identical pieces.

  THIS VERSION IS FLIPPED TO THE OPPOSITE PCB CORNER HOLE
  --------------------------------------------------------
  The physical test showed that triangle_handedness = 1 placed the
  mounting tab over the DIN/DOUT/V+/V- connector corner. This version
  uses triangle_handedness = -1, moving every tab and pilot hole to the
  opposite, unobstructed corner hole while preserving all panel angles,
  gussets, screw offsets and clearances.

  Intended PCB orientation:
    - 65 mm PCB sides face the triangular openings.
    - 66 mm PCB sides face the pentagonal openings.
    - The two PCB corners carrying DIN/DOUT and power pads are not used
      mechanically.
    - Each triangle uses only the unobstructed corner hole of each of
      its three neighbouring panels: 3 screws total per triangle.

  IMPORTANT HANDEDNESS
  --------------------
  triangle_handedness = -1 is now selected from the physical fit test.
  It uses the opposite corner hole from the electrical connector pads.

  Because all three edges use the same rotational convention, all 20
  triangle pieces can be identical.

  Printing orientation:
    - The smooth outside triangular face lies at Z = 0.
    - The angled mounting flanges point upward, toward the sphere centre.

  Mechanical details:
    - Hidden wedge gussets fill the flange/plate gap but are clipped at
      the outside Z=0 plane, preserving a flat visible surface.
    - 2.0 mm triangular main plate.
    - Enlarged PCB-envelope clearance removes any gusset or lip
      fragments that could obstruct the real panel edges.
    - 3.0 mm thick screw tabs.
    - Round 1.6 mm fully through pilot holes for M2 screws.
    - PCB-facing 3.2 mm conical lead-in bevels make the black screw holes
      much easier to find while preserving the tight 1.6 mm pilot below.
    - Narrow 3 mm locating lip.
    - The lip stops before the unused connector corner so it does not
      obscure DIN/DOUT/V+/V- solder pads.
    - 0.20 mm printed-fit correction moves the pilot hole slightly
      farther from the triangle edge.
    - 0.50 mm surface correction moves the panel seating surface to
      improve flush alignment with the triangle face.

  Modes:
    mode = "print"     printable part
    mode = "assembly"  part plus three PCB previews
*/

$fn = 40;


// ==================================================================
// OUTPUT / TEST SETTINGS
// ==================================================================

mode = "print";
triangle_handedness = -1;


// ==================================================================
// REAL PANEL DIMENSIONS
// ==================================================================

triangle_panel_edge = 65.0;
panel_depth = 66.0;
panel_thickness = 0.80;

hole_from_corner = 8.0;
hole_from_panel_edge_nominal = 8.0;

pcb_hole_d_preview = 2.8;


// ==================================================================
// PRINTED-FIT CORRECTIONS
// ==================================================================

hole_edge_correction = 0.20;

hole_from_panel_edge =
    hole_from_panel_edge_nominal
    +
    hole_edge_correction;


surface_flush_correction = 0.50;

panel_mount_offset =
    panel_thickness
    +
    surface_flush_correction;

panel_front_offset =
    panel_mount_offset
    -
    panel_thickness;


// ==================================================================
// TRIANGLE COVER
// ==================================================================

cover_edge = 65.40;

cover_thickness = 2.00;

cover_corner_radius = 2.0;


// ==================================================================
// LIGHTWEIGHT MOUNTING FLANGES
// ==================================================================

flange_thickness = 3.0;

flange_overlap = 1.25;

edge_lip_depth = 3.0;

pilot_hole_d = 1.60;


// Screw-finding lead-in on the PCB-facing side of every triangle hole.
//
// The first 0.70 mm tapers from 3.2 mm down to the 1.6 mm pilot.
// The remaining material stays a tight self-tapping bore.

screw_bevel_entry_d = 3.20;

screw_bevel_depth = 0.70;


screw_tab_width = 13.0;

screw_tab_end_margin = 4.5;

screw_tab_corner_radius = 2.3;

lip_corner_radius = 0.8;

flange_end_relief = 1.35;


// The unused end of every edge is the electrical connector corner.

connector_corner_clearance = 14.0;


// ==================================================================
// REAL-PANEL COLLISION CLEARANCE
// ==================================================================

panel_envelope_clearance_xy = 0.30;


// ==================================================================
// HIDDEN ROOT GUSSETS
// ==================================================================

gusset_plate_inset = 0.25;

gusset_plate_width = 6.50;

gusset_plate_embed = 0.45;

gusset_plate_rise = 0.70;


gusset_lip_flange_depth =
    flange_overlap
    +
    edge_lip_depth;


gusset_tab_flange_depth =
    flange_overlap
    +
    hole_from_panel_edge
    +
    screw_tab_end_margin;


gusset_flange_embed = 0.80;

gusset_x_margin = 0.35;


// Reinforcement starts slightly behind the PCB seating surface.

gusset_panel_clearance = 0.05;


clip_size = 240;

eps = 0.03;


// ==================================================================
// VECTOR HELPERS
// ==================================================================

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
    a /
    length3(a);


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


// ==================================================================
// PROVEN RHOMBICOSIDODECAHEDRON ORIENTATION
// ==================================================================

sin18 = sin(18);

cos18 = cos(18);


u1 = [
     0.925614797,
    -0.229752916,
     0.300750477
];


u2 = [
    -0.925614797,
    -0.229752916,
     0.300750477
];


w1 = [
    -sin18,
     0,
     cos18
];


w2 = [
     sin18,
     0,
     cos18
];


v1 =
    unit3(
        cross3(
            w1,
            u1
        )
    );


v2 =
    unit3(
        cross3(
            w2,
            u2
        )
    );


edge_tri_1 =
    unit3(
        u1
        -
        v1
    );


edge_tri_2 =
    unit3(
        u2
        +
        v2
    );


square_in_1 =
    unit3(
        u1
        +
        v1
    );


tri_inward_normal =
    unit3(
        cross3(
            edge_tri_2,
            edge_tri_1
        )
    );


tri_center_dir =
    unit3(
        edge_tri_1
        +
        edge_tri_2
    );


triangle_in_from_edge =
    unit3(
        cross3(
            edge_tri_1,
            tri_inward_normal
        )
    );


function face_radius(n,side) =
    side
    /
    (
        2*sin(180/n)
    );


tri_center =
    face_radius(
        3,
        triangle_panel_edge
    )
    *
    tri_center_dir;


tri_x =
    unit3(
        -tri_center
    );


tri_z =
    tri_inward_normal;


tri_y =
    unit3(
        cross3(
            tri_z,
            tri_x
        )
    );


module world_to_triangle_frame() {

    multmatrix([
        [
            tri_x[0],
            tri_x[1],
            tri_x[2],
            -dot3(
                tri_x,
                tri_center
            )
        ],
        [
            tri_y[0],
            tri_y[1],
            tri_y[2],
            -dot3(
                tri_y,
                tri_center
            )
        ],
        [
            tri_z[0],
            tri_z[1],
            tri_z[2],
            -dot3(
                tri_z,
                tri_center
            )
        ],
        [0,0,0,1]
    ])

    children();
}


module at_triangle_edge(k) {

    translate(tri_center)

        rotate(
            a = -120*k,
            v = tri_inward_normal
        )

            translate(-tri_center)

                children();
}


// ==================================================================
// 2D SHAPE HELPERS
// ==================================================================

module rounded_rect_2d(
    x0,
    x1,
    y0,
    y1,
    radius
) {

    assert(
        x1 > x0 + 2*radius
        &&
        y1 > y0 + 2*radius,

        "Rounded rectangle is too small for requested radius"
    );


    hull() {

        for(x=[
            x0 + radius,
            x1 - radius
        ])

            for(y=[
                y0 + radius,
                y1 - radius
            ])

                translate([x,y])

                    circle(
                        r = radius
                    );
    }
}


module rounded_triangle_2d(
    side,
    radius
) {

    circumradius =
        side
        /
        sqrt(3);


    offset(r=radius)

        offset(delta=-radius)

            polygon(
                points=[
                    for(k=[0:2])
                        [
                            circumradius*cos(120*k),
                            circumradius*sin(120*k)
                        ]
                ]
            );
}


// ==================================================================
// OUTSIDE TRIANGLE FACE
// ==================================================================

module triangle_cover() {

    linear_extrude(
        height = cover_thickness,
        convexity = 4
    )

        rounded_triangle_2d(
            cover_edge,
            cover_corner_radius
        );
}


// ==================================================================
// ONE-SCREW FLANGE FOOTPRINT
// ==================================================================

module flange_footprint_2d(
    usable_length,
    hole_x,
    hole_y,
    lip_x0,
    lip_x1
) {

    union() {

        rounded_rect_2d(
            lip_x0,
            lip_x1,
            0,
            flange_overlap
            +
            edge_lip_depth,
            lip_corner_radius
        );


        rounded_rect_2d(
            hole_x
            -
            screw_tab_width/2,

            hole_x
            +
            screw_tab_width/2,

            0,

            hole_y
            +
            screw_tab_end_margin,

            screw_tab_corner_radius
        );
    }
}


// ==================================================================
// ONE ANGLED PANEL FLANGE
// ==================================================================

module canonical_flange() {

    usable_length =
        triangle_panel_edge
        -
        2*flange_end_relief;


    selected_hole_x_absolute =
        triangle_handedness == 1
        ?
        hole_from_corner
        :
        triangle_panel_edge
        -
        hole_from_corner;


    hole_x =
        selected_hole_x_absolute
        -
        flange_end_relief;


    hole_y =
        flange_overlap
        +
        hole_from_panel_edge;


    lip_x0 =
        triangle_handedness == 1
        ?
        0
        :
        connector_corner_clearance;


    lip_x1 =
        triangle_handedness == 1
        ?
        usable_length
        -
        connector_corner_clearance
        :
        usable_length;


    flange_origin =
          flange_end_relief
          *
          edge_tri_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    local_frame(
        flange_origin,
        edge_tri_1,
        square_in_1,
        w1
    )

        difference() {

            linear_extrude(
                height = flange_thickness,
                convexity = 8
            )

                flange_footprint_2d(
                    usable_length,
                    hole_x,
                    hole_y,
                    lip_x0,
                    lip_x1
                );


            // Basic through-hole.
            //
            // The final full-part cutter below adds the conical
            // PCB-facing entrance bevel.

            translate([
                hole_x,
                hole_y,
                -eps
            ])

                cylinder(
                    d = pilot_hole_d,
                    h =
                        flange_thickness
                        +
                        2*eps,
                    $fn = 32
                );
        }
}


// ==================================================================
// HIDDEN WEDGE BETWEEN FLANGE AND TRIANGLE PLATE
// ==================================================================

module gusset_interval(
    x0,
    x1,
    flange_origin,
    upper_depth
) {

    if(x1 > x0)

        hull() {

            local_frame(
                flange_origin,
                edge_tri_1,
                square_in_1,
                w1
            )

                translate([
                    x0,
                    0,
                    0
                ])

                    cube([
                        x1-x0,
                        upper_depth,
                        gusset_flange_embed
                    ]);


            local_frame(
                flange_end_relief
                *
                edge_tri_1,

                edge_tri_1,
                triangle_in_from_edge,
                tri_inward_normal
            )

                translate([
                    x0,
                    gusset_plate_inset,
                    cover_thickness
                    -
                    gusset_plate_embed
                ])

                    cube([
                        x1-x0,
                        gusset_plate_width,
                        gusset_plate_embed
                        +
                        gusset_plate_rise
                    ]);
        }
}


module canonical_gusset_raw() {

    usable_length =
        triangle_panel_edge
        -
        2*flange_end_relief;


    selected_hole_x_absolute =
        triangle_handedness == 1
        ?
        hole_from_corner
        :
        triangle_panel_edge
        -
        hole_from_corner;


    hole_x =
        selected_hole_x_absolute
        -
        flange_end_relief;


    lip_x0 =
        triangle_handedness == 1
        ?
        0
        :
        connector_corner_clearance;


    lip_x1 =
        triangle_handedness == 1
        ?
        usable_length
        -
        connector_corner_clearance
        :
        usable_length;


    flange_origin =
          flange_end_relief
          *
          edge_tri_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    union() {

        gusset_interval(
            lip_x0
            +
            gusset_x_margin,

            lip_x1
            -
            gusset_x_margin,

            flange_origin,

            gusset_lip_flange_depth
        );


        gusset_interval(
            hole_x
            -
            screw_tab_width/2
            +
            gusset_x_margin,

            hole_x
            +
            screw_tab_width/2
            -
            gusset_x_margin,

            flange_origin,

            gusset_tab_flange_depth
        );
    }
}


// ==================================================================
// PCB-SAFE GUSSET CLIPPING
// ==================================================================

module canonical_panel_inward_halfspace() {

    flange_origin =
          flange_end_relief
          *
          edge_tri_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    local_frame(
        flange_origin,
        edge_tri_1,
        square_in_1,
        w1
    )

        translate([
            -clip_size/2,
            -clip_size/2,
            gusset_panel_clearance
        ])

            cube([
                clip_size,
                clip_size,
                clip_size
            ]);
}


module canonical_gusset() {

    intersection() {

        canonical_gusset_raw();

        canonical_panel_inward_halfspace();
    }
}


module all_three_flanges_local() {

    world_to_triangle_frame()

        for(k=[0:2])

            at_triangle_edge(k)

                canonical_flange();
}


module all_three_gussets_local() {

    intersection() {

        world_to_triangle_frame()

            union() {

                for(k=[0:2])

                    at_triangle_edge(k)

                        canonical_gusset();
            }


        // Never allow reinforcement below the outside surface.

        translate([
            -clip_size/2,
            -clip_size/2,
            0
        ])

            cube([
                clip_size,
                clip_size,
                clip_size
            ]);
    }
}


// ==================================================================
// PILOT HOLE + CONICAL LEAD-IN
// ==================================================================

// Re-cut the holes through the COMPLETE union so the gussets can never
// partially close them.
//
// Flange-local Z=0 is the exact PCB-back seating surface.
//
// Hole shape:
//
// PCB
//  ↓
//
//  3.2 mm entrance
//      \ /
//       V
//       | 1.6 mm pilot
//       |
//       |
//

module canonical_pilot_cutter() {

    selected_hole_x_absolute =
        triangle_handedness == 1
        ?
        hole_from_corner
        :
        triangle_panel_edge
        -
        hole_from_corner;


    hole_x =
        selected_hole_x_absolute
        -
        flange_end_relief;


    hole_y =
        flange_overlap
        +
        hole_from_panel_edge;


    flange_origin =
          flange_end_relief
          *
          edge_tri_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    local_frame(
        flange_origin,
        edge_tri_1,
        square_in_1,
        w1
    )

        translate([
            hole_x,
            hole_y,
            0
        ])

            union() {

                // Tight pilot through the whole support.

                translate([
                    0,
                    0,
                    -12
                ])

                    cylinder(
                        d = pilot_hole_d,
                        h = 24,
                        $fn = 32
                    );


                // PCB-facing funnel.

                translate([
                    0,
                    0,
                    -eps
                ])

                    cylinder(
                        d1 = screw_bevel_entry_d,
                        d2 = pilot_hole_d,
                        h =
                            screw_bevel_depth
                            +
                            eps,
                        $fn = 40
                    );
            }
}


module all_three_pilot_cutters_local() {

    world_to_triangle_frame()

        for(k=[0:2])

            at_triangle_edge(k)

                canonical_pilot_cutter();
}


// ==================================================================
// PCB COLLISION CUTTER
// ==================================================================

module canonical_panel_envelope_cutter() {

    preview_origin =
        panel_front_offset
        *
        w1;


    local_frame(
        preview_origin,
        edge_tri_1,
        square_in_1,
        w1
    )

        translate([
            -panel_envelope_clearance_xy,
            -panel_envelope_clearance_xy,
            -eps
        ])

            cube([
                triangle_panel_edge
                +
                2*panel_envelope_clearance_xy,

                panel_depth
                +
                2*panel_envelope_clearance_xy,

                panel_thickness
                +
                eps
            ]);
}


module all_three_panel_envelope_cutters_local() {

    world_to_triangle_frame()

        for(k=[0:2])

            at_triangle_edge(k)

                canonical_panel_envelope_cutter();
}


// ==================================================================
// FINAL PRINTABLE PART
// ==================================================================

module printable_part() {

    difference() {

        union() {

            triangle_cover();

            all_three_flanges_local();

            all_three_gussets_local();
        }


        // Tight pilots + conical screw-finding entrances.

        all_three_pilot_cutters_local();


        // Remove any plastic entering the real PCB envelope.

        all_three_panel_envelope_cutters_local();
    }
}


// ==================================================================
// PCB ASSEMBLY PREVIEW
// ==================================================================

module canonical_panel_preview() {

    preview_origin =
        panel_front_offset
        *
        w1;


    local_frame(
        preview_origin,
        edge_tri_1,
        square_in_1,
        w1
    )

        difference() {

            cube([
                triangle_panel_edge,
                panel_depth,
                panel_thickness
            ]);


            for(x=[
                hole_from_corner,
                triangle_panel_edge
                -
                hole_from_corner
            ])

                translate([
                    x,
                    hole_from_panel_edge_nominal,
                    -eps
                ])

                    cylinder(
                        d = pcb_hole_d_preview,
                        h =
                            panel_thickness
                            +
                            2*eps,
                        $fn = 28
                    );
        }
}


module panel_preview_set_local() {

    world_to_triangle_frame()

        for(k=[0:2])

            at_triangle_edge(k)

                canonical_panel_preview();
}


// ==================================================================
// CHECKS
// ==================================================================

assert(
    triangle_handedness == 1
    ||
    triangle_handedness == -1,

    "triangle_handedness must be 1 or -1"
);


assert(
    connector_corner_clearance > 0,

    "connector_corner_clearance must be positive"
);


assert(
    panel_envelope_clearance_xy >= 0,

    "panel_envelope_clearance_xy must be non-negative"
);


assert(
    screw_tab_width >
    pilot_hole_d + 4,

    "Increase screw_tab_width"
);


assert(
    screw_bevel_entry_d >
    pilot_hole_d,

    "screw_bevel_entry_d must be larger than pilot_hole_d"
);


assert(
    screw_bevel_depth > 0
    &&
    screw_bevel_depth < flange_thickness,

    "screw_bevel_depth must be between 0 and flange_thickness"
);


assert(
    flange_overlap > 0.8,

    "Increase flange_overlap for a reliable union"
);


assert(
    gusset_plate_embed > 0
    &&
    gusset_plate_embed < cover_thickness,

    "gusset_plate_embed must be between 0 and cover_thickness"
);


assert(
    gusset_plate_inset >= 0,

    "gusset_plate_inset must be non-negative"
);


assert(
    gusset_flange_embed > 0
    &&
    gusset_flange_embed < flange_thickness,

    "gusset_flange_embed must be inside flange_thickness"
);


assert(
    gusset_panel_clearance >= 0
    &&
    gusset_panel_clearance < gusset_flange_embed,

    "gusset_panel_clearance must be smaller than gusset_flange_embed"
);


// ==================================================================
// DIAGNOSTICS
// ==================================================================

selected_hole_from_start =
    triangle_handedness == 1
    ?
    hole_from_corner
    :
    triangle_panel_edge
    -
    hole_from_corner;


selected_hole_from_end =
    triangle_panel_edge
    -
    selected_hole_from_start;


echo(
    str(
        "Triangle panel edge: ",
        triangle_panel_edge,
        " mm"
    )
);


echo(
    str(
        "Triangle cover edge: ",
        cover_edge,
        " mm"
    )
);


echo(
    str(
        "Triangle main plate thickness: ",
        cover_thickness,
        " mm"
    )
);


echo(
    str(
        "Selected hole from edge start: ",
        selected_hole_from_start,
        " mm"
    )
);


echo(
    str(
        "Selected hole from edge end: ",
        selected_hole_from_end,
        " mm"
    )
);


echo(
    str(
        "Hole perpendicular from PCB edge: ",
        hole_from_panel_edge,
        " mm"
    )
);


echo(
    str(
        "Panel front flush correction: ",
        surface_flush_correction,
        " mm"
    )
);


echo(
    str(
        "Triangle handedness: ",
        triangle_handedness
    )
);


echo(
    str(
        "Screw lead-in diameter: ",
        screw_bevel_entry_d,
        " mm"
    )
);


echo(
    str(
        "Screw lead-in depth: ",
        screw_bevel_depth,
        " mm"
    )
);


echo(
    str(
        "PCB envelope lateral clearance: ",
        panel_envelope_clearance_xy,
        " mm"
    )
);


echo(
    "Print quantity: 20"
);


// ==================================================================
// OUTPUT
// ==================================================================

if(mode == "print") {

    printable_part();

} else if(mode == "assembly") {

    color([
        0.85,
        0.28,
        0.12,
        1.0
    ])

        printable_part();


    color([
        0.08,
        0.08,
        0.08,
        0.52
    ])

        panel_preview_set_local();

} else {

    assert(
        false,
        "mode must be print or assembly"
    );
}
